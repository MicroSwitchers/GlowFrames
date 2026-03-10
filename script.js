// PWA Update Detection
const APP_VERSION = '1.0.5';

// Check for PWA updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
            console.log('Service Worker registered:', registration);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New content is available, prompt user to update
                        if (confirm('A new version is available! Refresh to update?')) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                        }
                    }
                });
            });
        })
        .catch((error) => {
            console.log('Service Worker registration failed:', error);
        });
    
    // Listen for SW updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// State management
const AppState = {
    selectedShape: null,
    isLocked: false,
    isFullyIlluminated: false,
    previousAmbientValue: 0,
    baseColor: [255, 255, 255],
    highContrastMode: false,
    focusedShape: null
};

// Add this utility function at the top of your script.js file
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// DOM Elements management
const Elements = {
    drawer: document.querySelector('.drawer'),
    drawerToggle: document.querySelector('.drawer-toggle'),
    drawerContent: document.getElementById('drawer-content'),
    canvas: document.getElementById('canvas'),
    controls: {
        warmth: document.getElementById('warmth'),
        ambient: document.getElementById('ambient'),
        lockCanvas: document.getElementById('canvasLock'),
        fullSurface: document.getElementById('illuminateFullSurface'),
        fullscreen: document.getElementById('fullscreenToggle'),
        rgb: {
            red: document.getElementById('redSlider'),
            green: document.getElementById('greenSlider'),
            blue: document.getElementById('blueSlider'),
            redValue: document.getElementById('redValue'),
            greenValue: document.getElementById('greenValue'),
            blueValue: document.getElementById('blueValue'),
            reset: document.getElementById('resetRGB')
        },
        glowSlider: document.getElementById('glowSlider'),
        glowValue: document.getElementById('glowValue'),
        shapeBrightness: document.getElementById('shapeBrightness')
    },
    shapes: document.getElementsByClassName('shape')  // Use getElementsByClassName instead of querySelectorAll
};

// Platform detection
const Platform = {
    isIOS: () => /iPhone|iPad|iPod/i.test(navigator.userAgent),
    isAndroid: () => /Android/i.test(navigator.userAgent),
    isMobile: () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
    
    checkIOSFullscreen: () => {
        if (Platform.isIOS() && !Platform.isStandalone()) {
            alert("For the best experience on iPhone/iPad, add this app to your home screen and open it from there.");
        }
    },
    
    checkPWACompatibility: () => {
        const isCompatible = 'serviceWorker' in navigator && 'Cache' in window && 'fetch' in window;
        if (!isCompatible) {
            console.warn('PWA features not fully supported in this browser');
        }
        return isCompatible;
    }
};

// Color management
const ColorManager = {
    updateWarmColor: (warmth) => {
        // Invert warmth so 100 = warm, 0 = cool
        const invertedWarmth = 100 - warmth;
        const r = AppState.baseColor[0];
        const g = Math.round(AppState.baseColor[1] * (0.93 + (invertedWarmth * 0.0007)));
        const b = Math.round(AppState.baseColor[2] * (0.84 + (invertedWarmth * 0.0016)));
        return [r, g, b];
    },

    updateAllColors: () => {
        const warmth = Elements.controls.warmth.value;
        const ambient = Elements.controls.ambient.value;

        // Get base RGB color
        const baseRGB = [
            parseInt(Elements.controls.rgb.red.value),
            parseInt(Elements.controls.rgb.green.value),
            parseInt(Elements.controls.rgb.blue.value)
        ];

        // Apply warmth to the base color
        const warmColor = ColorManager.updateWarmColor(warmth, baseRGB);

        // Apply shape brightness
        const brightness = parseInt(Elements.controls.shapeBrightness?.value ?? 100);
        const shapeColor = warmColor.map(c => Math.round(c * (brightness / 100)));

        // Update shapes with color and CSS variable for glow
        document.querySelectorAll('.shape').forEach(shape => {
            shape.style.backgroundColor = `rgb(${shapeColor.join(',')})`;
            // Set CSS variable for glow color
            shape.style.setProperty('--shape-color', shapeColor.join(','));
        });

        // Update background
        const bgColor = warmColor.map(c => Math.round(c * (ambient / 100)));
        Elements.canvas.style.backgroundColor = `rgb(${bgColor.join(',')})`;
    },

    checkContrast: (foreground, background) => {
        // Calculate relative luminance
        const getLuminance = (r, g, b) => {
            const [rs, gs, bs] = [r/255, g/255, b/255].map(c => 
                c <= 0.03928 ? c/12.92 : Math.pow((c + 0.055)/1.055, 2.4)
            );
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };
        
        const l1 = getLuminance(...foreground);
        const l2 = getLuminance(...background);
        
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return ratio >= 4.5; // WCAG AA standard
    }
};

// Bounding box management
const BoundingBoxManager = {
    create: (shape) => {
        const box = document.createElement('div');
        box.className = `bounding-box ${shape.classList.contains('circle') ? 'circle' : 'square'}`;
        
        // Create delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.innerHTML = '×';
        deleteButton.setAttribute('aria-label', 'Delete shape');
        
        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        
        // Add controls to box
        box.appendChild(deleteButton);
        box.appendChild(resizeHandle);
        
        // Position box relative to canvas
        box.style.position = 'absolute';
        box.style.width = shape.style.width;
        box.style.height = shape.style.height;
        box.style.left = shape.style.left;
        box.style.top = shape.style.top;
        
        Elements.canvas.appendChild(box);
        shape.boundingBox = box;
        
        // Setup event listeners
        deleteButton.addEventListener('click', () => {
            shape.remove();
            box.remove();
            updateGlowSliderState();
        });
        
        BoundingBoxManager.setupResize(shape, resizeHandle);
        
        return { box, resizeHandle };
    },

    setupResize: (shape, handle) => {
        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        const onPointerMove = (e) => {
            if (!isResizing || AppState.isLocked) return;
            e.preventDefault();
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (shape.classList.contains('circle')) {
                const newSize = Math.max(startWidth + Math.max(dx, dy), 50);
                shape.style.width = `${newSize}px`;
                shape.style.height = `${newSize}px`;
            } else {
                const newWidth = Math.max(startWidth + dx, 50);
                const newHeight = Math.max(startHeight + dy, 50);
                shape.style.width = `${newWidth}px`;
                shape.style.height = `${newHeight}px`;
            }
            BoundingBoxManager.updatePosition(shape);
        };

        const onPointerUp = (e) => {
            if (!isResizing) return;
            isResizing = false;

            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };

        const onPointerDown = (e) => {
            if (AppState.isLocked) return;
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(shape.style.width) || 150;
            startHeight = parseInt(shape.style.height) || 150;
            
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        };

        handle.addEventListener('pointerdown', onPointerDown);
    },

    hideAll: () => {
        document.querySelectorAll('.bounding-box').forEach(box => {
            box.style.display = 'none';
        });
    },

    show: (shape) => {
        // Hide all other bounding boxes first
        BoundingBoxManager.hideAll();
        
        // Show this shape's bounding box
        if (shape.boundingBox) {
            const box = shape.boundingBox;
            box.style.display = 'block';
            box.style.width = shape.style.width;
            box.style.height = shape.style.height;
            box.style.left = shape.style.left;
            box.style.top = shape.style.top;
        }
    },

    hide: (shape) => {
        if (shape.boundingBox) {
            shape.boundingBox.style.display = 'none';
        }
    },

    updatePosition: (shape) => {
        if (shape.boundingBox) {
            shape.boundingBox.style.left = shape.style.left;
            shape.boundingBox.style.top = shape.style.top;
            shape.boundingBox.style.width = shape.style.width;
            shape.boundingBox.style.height = shape.style.height;
            shape.boundingBox.style.transform = shape.style.transform || 'rotate(0deg)';
        }
    }
};

// Gesture Handler for multi-touch
const GestureHandler = {
    activeTouches: new Map(),

    handleTouchStart: (shape, e) => {
        // Track all touches for this shape
        Array.from(e.touches).forEach(touch => {
            GestureHandler.activeTouches.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY,
                shape: shape
            });
        });

        if (e.touches.length === 2) {
            e.preventDefault();
            GestureHandler.startGesture(shape, e);
        }
    },

    handleTouchMove: (shape, e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            GestureHandler.processGesture(shape, e);
        }
    },

    handleTouchEnd: (shape, e) => {
        // Remove ended touches
        Array.from(e.changedTouches).forEach(touch => {
            GestureHandler.activeTouches.delete(touch.identifier);
        });
    },

    startGesture: (shape, e) => {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // Calculate initial distance for pinch
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        shape.gestureStartDistance = Math.sqrt(dx * dx + dy * dy);

        // Calculate initial angle for rotation
        shape.gestureStartAngle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Store initial dimensions
        shape.gestureStartWidth = parseInt(shape.style.width) || 150;
        shape.gestureStartHeight = parseInt(shape.style.height) || 150;

        // Store initial rotation
        const currentTransform = shape.style.transform || '';
        const rotateMatch = currentTransform.match(/rotate\(([-\d.]+)deg\)/);
        shape.gestureStartRotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
    },

    processGesture: (shape, e) => {
        if (!shape.gestureStartDistance) return;

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // Calculate current distance for pinch-to-resize
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        const scale = currentDistance / shape.gestureStartDistance;

        // Calculate current angle for rotation
        const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        const rotationDelta = currentAngle - shape.gestureStartAngle;
        const newRotation = shape.gestureStartRotation + rotationDelta;

        // Apply pinch-to-resize
        if (shape.classList.contains('circle')) {
            const newSize = Math.max(shape.gestureStartWidth * scale, 50);
            shape.style.width = `${newSize}px`;
            shape.style.height = `${newSize}px`;
        } else {
            const newWidth = Math.max(shape.gestureStartWidth * scale, 50);
            const newHeight = Math.max(shape.gestureStartHeight * scale, 50);
            shape.style.width = `${newWidth}px`;
            shape.style.height = `${newHeight}px`;
        }

        // Apply rotation
        shape.style.transform = `rotate(${newRotation}deg)`;
        shape.dataset.rotation = newRotation;

        // Update bounding box
        BoundingBoxManager.updatePosition(shape);
    }
};

// Shape management
const ShapeManager = {
    createShape: (event) => {
        return safeExecute(() => {
            const button = event.currentTarget;
            if (button.id === 'illuminateFullSurface') return;

            // Deselect previous shape
            if (AppState.selectedShape) {
                BoundingBoxManager.hide(AppState.selectedShape);
            }

            const shape = document.createElement('div');
            const shapeType = button.dataset.shape;

            shape.classList.add('shape', shapeType);
            Object.assign(shape.style, {
                width: '150px',
                height: '150px',
                position: 'absolute',
                left: `${window.innerWidth / 2 - 75}px`,
                top: `${window.innerHeight / 2 - 75}px`,
                backgroundColor: 'white',
                transform: 'rotate(0deg)'
            });

            // Store rotation data
            shape.dataset.rotation = '0';

            // Add accessibility attributes
            shape.setAttribute('role', 'button');
            shape.setAttribute('tabindex', '0');
            shape.setAttribute('aria-label', `${shapeType} light source`);
            shape.setAttribute('aria-grabbed', 'false');

            Elements.canvas.appendChild(shape);

            // Create and show bounding box immediately
            const { box, resizeHandle } = BoundingBoxManager.create(shape);
            box.style.display = 'block'; // Ensure box is visible

            // Set as selected shape
            AppState.selectedShape = shape;

            ShapeManager.setupInteraction(shape);
            ColorManager.updateAllColors();

            // Focus the new shape for keyboard interaction
            shape.focus();
            updateGlowSliderState();
        }, null);
    },

    setupInteraction: (shape) => {
        let isDragging = false;
        let startX = 0, startY = 0, initialX = 0, initialY = 0;

        const handleClick = (e) => {
            if (AppState.isLocked) return;
            e.stopPropagation(); // Prevent document click handler from interfering
            
            // Deselect previous shape if different
            if (AppState.selectedShape && AppState.selectedShape !== shape) {
                BoundingBoxManager.hide(AppState.selectedShape);
            }
            
            // Select this shape
            AppState.selectedShape = shape;
            BoundingBoxManager.show(shape);
            
            shape.focus();
        };

        const onPointerMove = (e) => {
            if (!isDragging || AppState.isLocked) return;
            e.preventDefault();
            
            const newX = initialX + (e.clientX - startX);
            const newY = initialY + (e.clientY - startY);
            
            // Ensure shape stays visible during drag
            shape.style.left = `${newX}px`;
            shape.style.top = `${newY}px`;
            shape.style.display = 'block'; // Ensure shape remains visible
            
            if (shape.boundingBox) {
                shape.boundingBox.style.left = `${newX}px`;
                shape.boundingBox.style.top = `${newY}px`;
            }
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
            
            shape.classList.remove('dragging');
            if (shape.boundingBox) {
                shape.boundingBox.classList.remove('dragging');
            }
        };

        const onPointerDown = (e) => {
            if (AppState.isLocked) return;
            e.preventDefault();
            e.stopPropagation(); // Prevent canvas handler from interfering
            
            handleClick(e);
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseInt(shape.style.left) || 0;
            initialY = parseInt(shape.style.top) || 0;
            
            shape.classList.add('dragging');
            if (shape.boundingBox) {
                shape.boundingBox.classList.add('dragging');
            }
            
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        };

        // Keyboard operability
        const onKeyDown = (e) => {
            if (AppState.isLocked) return;
            const step = e.shiftKey ? 10 : 2;
            let consumed = false;
            const curLeft = parseInt(shape.style.left) || 0;
            const curTop = parseInt(shape.style.top) || 0;
            if (e.key === 'ArrowLeft') { shape.style.left = `${curLeft - step}px`; consumed = true; }
            if (e.key === 'ArrowRight') { shape.style.left = `${curLeft + step}px`; consumed = true; }
            if (e.key === 'ArrowUp') { shape.style.top = `${curTop - step}px`; consumed = true; }
            if (e.key === 'ArrowDown') { shape.style.top = `${curTop + step}px`; consumed = true; }
            if (consumed) {
                BoundingBoxManager.updatePosition(shape);
                e.preventDefault();
            }
            if (e.key === 'Enter') {
                handleClick(e);
                e.preventDefault();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (confirm('Delete this shape?')) {
                    shape.remove();
                    if (shape.boundingBox) shape.boundingBox.remove();
                    AppState.selectedShape = null;
                    announceToScreenReader('Shape deleted');
                    updateGlowSliderState();
                }
                e.preventDefault();
            }
        };

        shape.addEventListener('pointerdown', onPointerDown);
        shape.addEventListener('keydown', onKeyDown);
        shape.addEventListener('click', handleClick);

        // Add touch gesture support
        shape.addEventListener('touchstart', (e) => GestureHandler.handleTouchStart(shape, e), { passive: false });
        shape.addEventListener('touchmove', (e) => GestureHandler.handleTouchMove(shape, e), { passive: false });
        shape.addEventListener('touchend', (e) => GestureHandler.handleTouchEnd(shape, e));
    }
};

// Fullscreen management
const FullscreenManager = {
    toggle: () => {
        if (Elements.controls.fullscreen.checked) {
            if (Platform.isIOS()) {
                alert("Fullscreen mode is not supported in iOS browsers. Add this app to your home screen.");
                Elements.controls.fullscreen.checked = false;
            } else {
                FullscreenManager.enter();
            }
        } else {
            FullscreenManager.exit();
        }
    },

    enter: () => {
        const docElement = document.documentElement;
        if (docElement.requestFullscreen) {
            docElement.requestFullscreen();
        } else if (docElement.webkitRequestFullscreen) {
            docElement.webkitRequestFullscreen();
        } else if (docElement.msRequestFullscreen) {
            docElement.msRequestFullscreen();
        } else if (docElement.mozRequestFullScreen) {
            docElement.mozRequestFullScreen();
        }
    },

    exit: () => {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
    },

    isFullscreen: () => {
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement ||
            document.mozFullScreenElement
        );
    },

    handleChange: () => {
        const isCurrentlyFullscreen = FullscreenManager.isFullscreen();
        Elements.controls.fullscreen.checked = isCurrentlyFullscreen;
        
        // Ensure UI state matches actual fullscreen state
        if (isCurrentlyFullscreen !== Elements.controls.fullscreen.checked) {
            Elements.controls.fullscreen.checked = isCurrentlyFullscreen;
        }
    }
};

// RGB Controls
function setupRGBControls() {
    const updateRGBValues = () => {
        AppState.baseColor = [
            parseInt(Elements.controls.rgb.red.value),
            parseInt(Elements.controls.rgb.green.value),
            parseInt(Elements.controls.rgb.blue.value)
        ];
        
        Elements.controls.rgb.redValue.textContent = AppState.baseColor[0];
        Elements.controls.rgb.greenValue.textContent = AppState.baseColor[1];
        Elements.controls.rgb.blueValue.textContent = AppState.baseColor[2];

        updateSliderFill(Elements.controls.rgb.red);
        updateSliderFill(Elements.controls.rgb.green);
        updateSliderFill(Elements.controls.rgb.blue);
        updateColorSwatch();
        throttledColorUpdate();
    };

    // RGB slider listeners
    Elements.controls.rgb.red.addEventListener('input', updateRGBValues);
    Elements.controls.rgb.green.addEventListener('input', updateRGBValues);
    Elements.controls.rgb.blue.addEventListener('input', updateRGBValues);

    // Reset RGB button
    Elements.controls.rgb.reset.addEventListener('click', () => {
        Elements.controls.rgb.red.value = 255;
        Elements.controls.rgb.green.value = 255;
        Elements.controls.rgb.blue.value = 255;
        updateRGBValues();
    });

    // RGB Section collapsible
    const rgbSection = document.querySelector('.collapsible-section');
    const rgbHeader = rgbSection.querySelector('.collapsible-header');
    const rgbContent = rgbSection.querySelector('.collapsible-content');

    rgbHeader.addEventListener('click', () => {
        const isOpen = rgbSection.classList.toggle('open');
        rgbContent.style.height = isOpen ? rgbContent.scrollHeight + 'px' : '0';
    });
}

// Add glow control function
function updateGlowIntensity() {
    const rawValue = Elements.controls.glowSlider.value;
    const intensity = rawValue / 100;
    document.documentElement.style.setProperty('--glow-intensity', intensity);
}

// Add helper function for screen reader announcements
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.classList.add('sr-only');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// Add error handling wrapper
function safeExecute(operation, fallback = null) {
    try {
        return operation();
    } catch (error) {
        console.error(`Operation failed: ${error.message}`);
        return fallback;
    }
}

// Add input validation
function validateNumericInput(value, min, max, defaultValue) {
    const num = parseFloat(value);
    if (isNaN(num) || num < min || num > max) {
        console.warn(`Invalid value: ${value}. Using default: ${defaultValue}`);
        return defaultValue;
    }
    return num;
}

// Add utility functions
function throttle(func) {
    let isWaiting = false;
    return function executedFunction(...args) {
        if (!isWaiting) {
            isWaiting = true;
            requestAnimationFrame(() => {
                func(...args);
                isWaiting = false;
            });
        }
    };
}

// UI utility: update slider fill track via CSS custom property
function updateSliderFill(slider) {
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
    slider.style.setProperty('--fill', `${pct.toFixed(1)}%`);
}

// UI utility: update value display badge
function setSliderDisplay(displayId, value, max) {
    const el = document.getElementById(displayId);
    if (!el) return;
    el.textContent = max === 100 ? `${Math.round(value)}%` : Math.round(value);
}

// UI utility: update the live color swatch in the RGB header
function updateColorSwatch() {
    const swatch = document.getElementById('colorSwatchPreview');
    if (!swatch) return;
    const r = Elements.controls.rgb.red?.value ?? 255;
    const g = Elements.controls.rgb.green?.value ?? 255;
    const b = Elements.controls.rgb.blue?.value ?? 255;
    swatch.style.background = `rgb(${r}, ${g}, ${b})`;
    swatch.style.boxShadow = `0 2px 8px rgba(${r}, ${g}, ${b}, 0.4)`;
}

// Add debouncing for intensive operations
const throttledColorUpdate = throttle(ColorManager.updateAllColors);

// Add cleanup function for shape removal
function removeShape(shape) {
    // Remove event listeners
    shape.removeEventListener('mousedown', handleMouseDown);
    shape.removeEventListener('touchstart', handleTouchStart);
    // Remove the shape
    shape.remove();
    updateGlowSliderState();
}

// Use DocumentFragment for multiple DOM insertions
function addMultipleShapes(shapes) {
    const fragment = document.createDocumentFragment();
    shapes.forEach(shape => fragment.appendChild(shape));
    Elements.canvas.appendChild(fragment);
}

// Event listeners setup
function setupEventListeners() {
    // Drawer open/close helpers with ARIA + focus mgmt
    const openDrawer = () => {
        if (Elements.drawer.classList.contains('open')) return;
        Elements.drawer.classList.add('open');
        Elements.drawerToggle.setAttribute('aria-expanded', 'true');
        Elements.drawerContent?.setAttribute('aria-hidden', 'false');
        // Move focus to first focusable control inside drawer for accessibility
        const firstFocusable = Elements.drawer.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 0);
        }
    };

    const closeDrawer = () => {
        if (!Elements.drawer.classList.contains('open')) return;
        Elements.drawer.classList.remove('open');
        Elements.drawerToggle.setAttribute('aria-expanded', 'false');
        Elements.drawerContent?.setAttribute('aria-hidden', 'true');
        Elements.drawerToggle.focus();
    };

    const toggleDrawer = () => {
        if (Elements.drawer.classList.contains('open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    };


    // Toggle interactions
    Elements.drawerToggle?.addEventListener('click', toggleDrawer);

    // Focus trap inside drawer
    const focusTrap = (e) => {
        if (!Elements.drawer.classList.contains('open')) return;
        const focusables = Elements.drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }
    };
    document.addEventListener('keydown', focusTrap);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDrawer();
        }
    });


    // Shape creation
    document.querySelectorAll('.shape-button').forEach(button => 
        button.addEventListener('click', ShapeManager.createShape));

    // Controls
    Elements.controls.warmth.addEventListener('input', (e) => {
        updateSliderFill(e.target);
        setSliderDisplay('warmthDisplay', e.target.value, 100);
        throttledColorUpdate();
    });
    Elements.controls.ambient.addEventListener('input', (e) => {
        updateSliderFill(e.target);
        setSliderDisplay('ambientDisplay', e.target.value, 100);
        // If user moves slider while Full is active, deactivate the button
        if (AppState.isFullyIlluminated) {
            AppState.isFullyIlluminated = false;
            Elements.controls.fullSurface.classList.remove('active');
        }
        AppState.previousAmbientValue = e.target.value;
        // Shape brightness can never be less than background brightness
        const ambientVal = parseInt(e.target.value);
        const sb = Elements.controls.shapeBrightness;
        if (sb && parseInt(sb.value) < ambientVal) {
            sb.value = ambientVal;
            updateSliderFill(sb);
            setSliderDisplay('shapeBrightnessDisplay', ambientVal, 100);
            // Also clamp glow to the new shape brightness
            const glow = Elements.controls.glowSlider;
            if (glow && parseInt(glow.value) > ambientVal) {
                glow.value = ambientVal;
                updateSliderFill(glow);
                setSliderDisplay('glowDisplay', ambientVal, 100);
            }
        }
        throttledColorUpdate();
    });
    Elements.controls.lockCanvas.addEventListener('change', (e) => {
        AppState.isLocked = e.target.checked;
        document.querySelectorAll('.shape').forEach(shape => {
            shape.classList.toggle('locked', AppState.isLocked);
            if (AppState.isLocked) {
                BoundingBoxManager.hide(shape);
            }
        });
    });

    // Fullscreen - Enhanced event handling
    Elements.controls.fullscreen.addEventListener('change', FullscreenManager.toggle);
    
    // Listen for all possible fullscreen change events
    document.addEventListener('fullscreenchange', FullscreenManager.handleChange);
    document.addEventListener('webkitfullscreenchange', FullscreenManager.handleChange);
    document.addEventListener('mozfullscreenchange', FullscreenManager.handleChange);
    document.addEventListener('msfullscreenchange', FullscreenManager.handleChange);
    
    // Also listen for keyboard events that might exit fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11' || e.key === 'Escape') {
            // Small delay to allow fullscreen state to update
            setTimeout(FullscreenManager.handleChange, 100);
        }
    });
    
    // Additional check on window focus/blur in case fullscreen changes
    window.addEventListener('focus', FullscreenManager.handleChange);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(FullscreenManager.handleChange, 100);
    });

    // Full surface illumination
    Elements.controls.fullSurface.addEventListener('click', () => {
        if (AppState.isFullyIlluminated) {
            AppState.isFullyIlluminated = false;
            Elements.controls.fullSurface.classList.remove('active');
            Elements.controls.ambient.value = AppState.previousAmbientValue;
        } else {
            AppState.previousAmbientValue = Elements.controls.ambient.value;
            AppState.isFullyIlluminated = true;
            Elements.controls.fullSurface.classList.add('active');
            Elements.controls.ambient.value = 100;
            // Shape brightness cannot be less than background — push it to 100 too
            const sb = Elements.controls.shapeBrightness;
            if (sb && parseInt(sb.value) < 100) {
                sb.value = 100;
                updateSliderFill(sb);
                setSliderDisplay('shapeBrightnessDisplay', 100, 100);
            }
        }
        updateSliderFill(Elements.controls.ambient);
        setSliderDisplay('ambientDisplay', Elements.controls.ambient.value, 100);
        throttledColorUpdate();
    });

    // Deselect shapes when pressing empty canvas space (not on a shape, bounding box, or drawer/overlay)
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.shape') &&
            !e.target.closest('.bounding-box') &&
            !e.target.closest('.drawer') &&
            !e.target.closest('.drawer-overlay') &&
            !e.target.closest('.drawer-toggle')) {
            document.querySelectorAll('.shape').forEach(shape =>
                BoundingBoxManager.hide(shape));
            AppState.selectedShape = null;
        }
    });

    Elements.controls?.shapeBrightness?.addEventListener('input', (e) => {
        // Clamp: shape brightness cannot go below background (ambient) brightness
        const ambientVal = parseInt(Elements.controls.ambient.value);
        if (parseInt(e.target.value) < ambientVal) {
            e.target.value = ambientVal;
        }
        updateSliderFill(e.target);
        setSliderDisplay('shapeBrightnessDisplay', e.target.value, 100);
        // Clamp glow down if it now exceeds shape brightness
        const glow = Elements.controls.glowSlider;
        if (glow && parseInt(glow.value) > parseInt(e.target.value)) {
            glow.value = e.target.value;
            updateSliderFill(glow);
            setSliderDisplay('glowDisplay', glow.value, 100);
        }
        throttledColorUpdate();
    });

    Elements.controls?.glowSlider?.addEventListener('input', (e) => {
        // Clamp: glow cannot exceed shape brightness
        const brightnessVal = parseInt(Elements.controls.shapeBrightness?.value ?? 100);
        if (parseInt(e.target.value) > brightnessVal) {
            e.target.value = brightnessVal;
        }
        updateSliderFill(e.target);
        setSliderDisplay('glowDisplay', e.target.value, 100);
        updateGlowIntensity();
    });

    // Clear All button - Reset to base defaults
    const clearAllButton = document.getElementById('clearAll');
    clearAllButton?.addEventListener('click', () => {
        if (confirm('Reset app to default settings? This will clear all shapes and reset all controls.')) {
            // Remove all shapes
            document.querySelectorAll('.shape').forEach(shape => {
                if (shape.boundingBox) {
                    shape.boundingBox.remove();
                }
                shape.remove();
            });

            // Reset all controls to defaults
            if (Elements.controls.ambient) Elements.controls.ambient.value = 0;
            if (Elements.controls.warmth) Elements.controls.warmth.value = 100;
            if (Elements.controls.glowSlider) Elements.controls.glowSlider.value = 0;
            if (Elements.controls.shapeBrightness) Elements.controls.shapeBrightness.value = 100;

            // Reset RGB to white
            if (Elements.controls.rgb?.red) Elements.controls.rgb.red.value = 255;
            if (Elements.controls.rgb?.green) Elements.controls.rgb.green.value = 255;
            if (Elements.controls.rgb?.blue) Elements.controls.rgb.blue.value = 255;

            // Reset RGB display values
            if (Elements.controls.rgb?.redValue) Elements.controls.rgb.redValue.textContent = '255';
            if (Elements.controls.rgb?.greenValue) Elements.controls.rgb.greenValue.textContent = '255';
            if (Elements.controls.rgb?.blueValue) Elements.controls.rgb.blueValue.textContent = '255';

            // Reset base color state
            AppState.baseColor = [255, 255, 255];

            // Reset checkboxes
            if (Elements.controls.lockCanvas) Elements.controls.lockCanvas.checked = false;
            if (Elements.controls.fullscreen && FullscreenManager.isFullscreen()) {
                FullscreenManager.exit();
                Elements.controls.fullscreen.checked = false;
            }

            // Reset full surface state
            AppState.isFullyIlluminated = false;
            AppState.previousAmbientValue = 0;
            Elements.controls.fullSurface?.classList.remove('active');

            // Reset app state
            AppState.selectedShape = null;
            AppState.isLocked = false;

            // Update all colors
            ColorManager.updateAllColors();
            updateGlowSliderState();

            // Sync slider fills and value displays
            updateSliderFill(Elements.controls.ambient);
            updateSliderFill(Elements.controls.warmth);
            updateSliderFill(Elements.controls.glowSlider);
            updateSliderFill(Elements.controls.shapeBrightness);
            updateSliderFill(Elements.controls.rgb.red);
            updateSliderFill(Elements.controls.rgb.green);
            updateSliderFill(Elements.controls.rgb.blue);
            setSliderDisplay('ambientDisplay', 0, 100);
            setSliderDisplay('warmthDisplay', 100, 100);
            setSliderDisplay('glowDisplay', 0, 100);
            setSliderDisplay('shapeBrightnessDisplay', 100, 100);
            updateColorSwatch();

            // Clear saved state
            localStorage.removeItem('lightboxState');

            announceToScreenReader('App reset to defaults');
        }
    });
}

// Simple toast
function showToast(message, options = {}) {
    const id = 'app-toast';
    let toast = document.getElementById(id);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = id;
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);
    if (options.actions) {
        options.actions.forEach(a => {
            const btn = document.createElement('button');
            btn.textContent = a.label;
            btn.addEventListener('click', a.onClick);
            toast.appendChild(btn);
        });
    }
    toast.classList.add('show');
    if (options.autoHide !== false) {
        setTimeout(() => toast.classList.remove('show'), options.duration || 5000);
    }
}

// Initialize application
function initializeApp() {
    try {
        ErrorHandler.init();
        Platform.checkIOSFullscreen();
        InputValidator.sanitizeInputs();
        StateManager.restoreState();
        
        // Initialize previousAmbientValue with the current slider value
        AppState.previousAmbientValue = Elements.controls.ambient.value;
        
        setupEventListeners();
        setupRGBControls();
        throttledColorUpdate();
        updateGlowSliderState();

        // Initialize slider fills and value display badges
        updateSliderFill(Elements.controls.ambient);
        updateSliderFill(Elements.controls.warmth);
        updateSliderFill(Elements.controls.glowSlider);
        updateSliderFill(Elements.controls.rgb.red);
        updateSliderFill(Elements.controls.rgb.green);
        updateSliderFill(Elements.controls.rgb.blue);
        updateSliderFill(Elements.controls.shapeBrightness);
        setSliderDisplay('ambientDisplay', Elements.controls.ambient?.value ?? 0, 100);
        setSliderDisplay('warmthDisplay', Elements.controls.warmth?.value ?? 100, 100);
        setSliderDisplay('glowDisplay', Elements.controls.glowSlider?.value ?? 0, 100);
        setSliderDisplay('shapeBrightnessDisplay', Elements.controls.shapeBrightness?.value ?? 100, 100);
        updateColorSwatch();

        // Register Service Worker for PWA functionality
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    const registration = await navigator.serviceWorker.register('./sw.js');
                    console.log('SW registered successfully:', registration);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Non-blocking update toast
                                showToast('Update available', {
                                    actions: [{
                                        label: 'Refresh',
                                        onClick: () => {
                                            if (registration.waiting) {
                                                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                                            } else {
                                                window.location.reload();
                                            }
                                        }
                                    }]
                                });
                            }
                        });
                    });
                    let refreshing = false;
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        if (refreshing) return;
                        refreshing = true;
                        window.location.reload();
                    });
                } catch (error) {
                    console.warn('SW registration failed:', error);
                    // App still works without SW
                }
            });
        }

        // PWA Install Prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            // Could show custom install button here
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA installed successfully');
            window.deferredPrompt = null;
        });

        // Add auto-save on unload
        window.addEventListener('beforeunload', () => {
            StateManager.saveState();
        });

        // Add periodic auto-save (every 5 seconds)
        setInterval(() => {
            StateManager.saveState();
        }, 5000);

    } catch (error) {
        console.error('Initialization failed:', error);
        // Show user-friendly error message
        alert('Unable to initialize application. Please refresh the page.');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);

// Error handling
const ErrorHandler = {
    init() {
        window.addEventListener('error', this.handleError.bind(this));
        window.addEventListener('unhandledrejection', this.handlePromiseError.bind(this));
    },

    handleError(event) {
        console.error('Application error:', event.error);
        this.attemptRecovery();
    },

    handlePromiseError(event) {
        console.error('Promise error:', event.reason);
        this.attemptRecovery();
    },

    attemptRecovery() {
        try {
            // Clear any stuck states
            BoundingBoxManager.hideAll();
            AppState.isLocked = false;
            AppState.selectedShape = null;
            
            // Reset UI to safe state
            const lockCheckbox = document.getElementById('canvasLock');
            if (lockCheckbox) lockCheckbox.checked = false;
            
            // Update controls
            updateGlowSliderState();
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
            // Last resort - suggest page refresh
            if (confirm('The app encountered an error. Would you like to refresh the page?')) {
                window.location.reload();
            }
        }
    }
};

const StateManager = {
    saveState() {
        try {
            const state = {
                shapes: Array.from(document.querySelectorAll('.shape')).map(shape => ({
                    type: shape.classList.contains('circle') ? 'circle' : 'square',
                    position: {
                        left: shape.style.left,
                        top: shape.style.top
                    },
                    size: {
                        width: shape.style.width,
                        height: shape.style.height
                    },
                    rotation: shape.dataset.rotation || '0',
                    color: shape.style.backgroundColor || 'white'
                })),
                settings: {
                    ambient: Elements.controls?.ambient?.value ?? 0,
                    warmth: Elements.controls?.warmth?.value ?? 100,
                    glow: Elements.controls?.glowSlider?.value ?? 0,
                    shapeBrightness: Elements.controls?.shapeBrightness?.value ?? 100,
                    rgb: {
                        red: Elements.controls?.rgb?.red?.value ?? 255,
                        green: Elements.controls?.rgb?.green?.value ?? 255,
                        blue: Elements.controls?.rgb?.blue?.value ?? 255
                    }
                }
            };
            localStorage.setItem('lightboxState', JSON.stringify(state));
        } catch (err) {
            console.warn('Failed to save state (possibly quota):', err);
        }
    },

    restoreState() {
        try {
            const saved = localStorage.getItem('lightboxState');
            if (saved) {
                let state = null;
                try { state = JSON.parse(saved); } catch (e) { console.warn('Bad saved state JSON'); }

                // Restore settings
                if (state?.settings) {
                    // Map saved keys to Elements.controls property names
                    const keyMap = { glow: 'glowSlider' };

                    Object.entries(state.settings).forEach(([key, value]) => {
                        if (key === 'rgb' && Elements.controls?.rgb) {
                            if (value.red !== undefined) Elements.controls.rgb.red.value = value.red;
                            if (value.green !== undefined) Elements.controls.rgb.green.value = value.green;
                            if (value.blue !== undefined) Elements.controls.rgb.blue.value = value.blue;
                            AppState.baseColor = [
                                parseInt(value.red ?? 255),
                                parseInt(value.green ?? 255),
                                parseInt(value.blue ?? 255)
                            ];
                        } else {
                            const controlKey = keyMap[key] ?? key;
                            const control = Elements.controls?.[controlKey];
                            if (control) {
                                // warmth saved as 0 means old default — upgrade to 100
                                if (key === 'warmth' && value === 0) {
                                    control.value = 100;
                                // shapeBrightness missing from old saves — keep HTML default of 100
                                } else if (key === 'shapeBrightness' && value === undefined) {
                                    control.value = 100;
                                } else {
                                    control.value = value;
                                }
                            }
                        }
                    });

                    // If shapeBrightness wasn't in the saved state at all, ensure default
                    if (state.settings.shapeBrightness === undefined && Elements.controls?.shapeBrightness) {
                        Elements.controls.shapeBrightness.value = 100;
                    }
                }

                // Restore shapes
                if (state?.shapes && Array.isArray(state.shapes)) {
                    state.shapes.forEach(shapeData => {
                        const shape = document.createElement('div');
                        const shapeType = shapeData.type || 'circle';

                        shape.classList.add('shape', shapeType);
                        Object.assign(shape.style, {
                            width: shapeData.size.width || '150px',
                            height: shapeData.size.height || '150px',
                            position: 'absolute',
                            left: shapeData.position.left || '100px',
                            top: shapeData.position.top || '100px',
                            backgroundColor: shapeData.color || 'white',
                            transform: `rotate(${shapeData.rotation || 0}deg)`
                        });

                        // Store rotation data
                        shape.dataset.rotation = shapeData.rotation || '0';

                        // Add accessibility attributes
                        shape.setAttribute('role', 'button');
                        shape.setAttribute('tabindex', '0');
                        shape.setAttribute('aria-label', `${shapeType} light source`);
                        shape.setAttribute('aria-grabbed', 'false');

                        Elements.canvas.appendChild(shape);

                        // Create bounding box (hidden initially)
                        BoundingBoxManager.create(shape);

                        // Setup interactions
                        ShapeManager.setupInteraction(shape);
                    });

                    // Update glow slider state after restoring shapes
                    updateGlowSliderState();
                }
            } else {
                // No saved state - apply first-run defaults
                if (Elements.controls?.warmth) Elements.controls.warmth.value = 100;
                if (Elements.controls?.shapeBrightness) Elements.controls.shapeBrightness.value = 100;
            }
        } catch (error) {
            console.error('Failed to restore state:', error);
            if (Elements.controls?.warmth) Elements.controls.warmth.value = 100;
            if (Elements.controls?.shapeBrightness) Elements.controls.shapeBrightness.value = 100;
        }
    }
};

const InputValidator = {
    validateNumericInput(value, min, max) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= min && num <= max;
    },

    sanitizeInputs() {
        const inputs = document.querySelectorAll('input[type="range"]');
        inputs.forEach(input => {
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);
            if (!this.validateNumericInput(input.value, min, max)) {
                input.value = min;
            }
        });
    }
};

const MemoryManager = {
    MAX_SHAPES: 50,
    
    checkMemoryUsage() {
        const shapes = document.querySelectorAll('.shape');
        if (shapes.length > this.MAX_SHAPES) {
            alert('Maximum number of shapes reached. Please remove some shapes to continue.');
            return false;
        }
        return true;
    },

    cleanup() {
        // Remove unused event listeners and references
        const shapes = document.querySelectorAll('.shape');
        shapes.forEach(shape => {
            shape.removeEventListener('mousedown', null);
            shape.removeEventListener('touchstart', null);
        });
    }
};

const TouchHandler = {
    touchStartTime: 0,
    touchTimeout: null,

    handleTouchStart(event) {
        this.touchStartTime = Date.now();
        this.touchTimeout = setTimeout(() => {
            // Long press handler
        }, 500);
    },

    handleTouchEnd(event) {
        clearTimeout(this.touchTimeout);
        const touchDuration = Date.now() - this.touchStartTime;
        if (touchDuration < 500) {
            // Short tap handler
        }
    }
};

function updateGlowSliderState() {
    const shapes = document.querySelectorAll('.shape');
    const glowSlider = document.getElementById('glowSlider');
    const glowLabel = document.querySelector('label[for="glowSlider"]');
    const glowDisplay = document.getElementById('glowDisplay');
    
    if (shapes.length === 0) {
        glowSlider.disabled = true;
        glowSlider.value = 0;
        glowLabel.classList.add('disabled');
        document.documentElement.style.setProperty('--glow-intensity', '0');
        updateSliderFill(glowSlider);
        if (glowDisplay) { glowDisplay.textContent = '0%'; glowDisplay.style.opacity = '0.4'; }
    } else {
        glowSlider.disabled = false;
        glowLabel.classList.remove('disabled');
        if (glowDisplay) glowDisplay.style.opacity = '';
    }
}
