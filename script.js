// PWA Update Detection
const APP_VERSION = '1.0.3';

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
        glowValue: document.getElementById('glowValue')
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

        // Update shapes with color and CSS variable for glow
        document.querySelectorAll('.shape').forEach(shape => {
            shape.style.backgroundColor = `rgb(${warmColor.join(',')})`;
            // Set CSS variable for glow color
            shape.style.setProperty('--shape-color', warmColor.join(','));
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
            
            BoundingBoxManager.hide(shape);
            AppState.selectedShape = null;
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
        }
    }
};

// Shape management
const ShapeManager = {
    createShape: (event) => {
        return safeExecute(() => {
            if (event.target.id === 'illuminateFullSurface') return;
            
            // Deselect previous shape
            if (AppState.selectedShape) {
                BoundingBoxManager.hide(AppState.selectedShape);
            }
        
            const shape = document.createElement('div');
            const shapeType = event.target.dataset.shape;
            
            shape.classList.add('shape', shapeType);
            Object.assign(shape.style, {
                width: '150px',
                height: '150px',
                position: 'absolute',
                left: `${window.innerWidth / 2 - 75}px`,
                top: `${window.innerHeight / 2 - 75}px`,
                backgroundColor: 'white'
            });

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

        debouncedColorUpdate();
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

// Add debouncing for intensive operations
const debouncedColorUpdate = debounce(ColorManager.updateAllColors, 16);

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
        // Hide all shape controls when drawer opens
        document.querySelectorAll('.shape').forEach(shape => BoundingBoxManager.hide(shape));
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

    // Close on outside click (but ignore clicks on the toggle button)
    document.addEventListener('click', (e) => {
        if (!Elements.drawer.classList.contains('open')) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        const clickedInsideDrawer = target.closest('.drawer');
        const clickedToggle = target.closest('.drawer-toggle');
        if (!clickedInsideDrawer && !clickedToggle) {
            closeDrawer();
        }
    });

    // Shape creation
    document.querySelectorAll('.shape-button').forEach(button => 
        button.addEventListener('click', ShapeManager.createShape));

    // Controls
    Elements.controls.warmth.addEventListener('input', debouncedColorUpdate);
    Elements.controls.ambient.addEventListener('input', debouncedColorUpdate);
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
        AppState.isFullyIlluminated = !AppState.isFullyIlluminated;
        Elements.controls.fullSurface.classList.toggle('active', AppState.isFullyIlluminated);

        if (AppState.isFullyIlluminated) {
            AppState.previousAmbientValue = Elements.controls.ambient.value;
            Elements.controls.ambient.value = 100;
        } else {
            Elements.controls.ambient.value = AppState.previousAmbientValue;
        }
        debouncedColorUpdate();
    });

    // Close controls when clicking outside shapes
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.shape') && !e.target.closest('.drawer')) {
            document.querySelectorAll('.shape').forEach(shape => 
                BoundingBoxManager.hide(shape));
        }
    });

    // Add canvas click handler to deselect shapes when clicking empty space
    Elements.canvas.addEventListener('pointerdown', (event) => {
        // Only handle if clicking directly on canvas, not on shapes or other elements
        if (event.target === Elements.canvas) {
            // Hide all bounding boxes when clicking canvas
            document.querySelectorAll('.bounding-box').forEach(box => {
                box.style.display = 'none';
            });
            AppState.selectedShape = null;
        }
    });

    Elements.controls?.glowSlider?.addEventListener('input', updateGlowIntensity);
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
        setupEventListeners();
        setupRGBControls();
        debouncedColorUpdate();
        updateGlowSliderState();

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

        // Add auto-save
        window.addEventListener('beforeunload', () => {
            StateManager.saveState();
        });

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
                    }
                })),
                settings: {
                    ambient: Elements.controls?.ambient?.value ?? 0,
                    warmth: Elements.controls?.warmth?.value ?? 100,
                    glow: Elements.controls?.glowSlider?.value ?? 0
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
                    Object.entries(state.settings).forEach(([key, value]) => {
                        if (Elements.controls && Elements.controls[key]) {
                        // Special handling for warmth - if it was saved as 0 (old default), use new default of 100
                        if (key === 'warmth' && value === 0) {
                                Elements.controls[key].value = 100;
                        } else {
                                Elements.controls[key].value = value;
                        }
                        }
                    });
                }
            } else {
                // No saved state - ensure warmth starts at 100 (warmest)
                if (Elements.controls?.warmth) {
                    Elements.controls.warmth.value = 100;
                }
            }
        } catch (error) {
            console.error('Failed to restore state:', error);
            // On error, ensure warmth defaults to warmest setting
            if (Elements.controls?.warmth) {
                Elements.controls.warmth.value = 100;
            }
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
    
    if (shapes.length === 0) {
        glowSlider.disabled = true;
        glowSlider.value = 0;
        glowLabel.classList.add('disabled');
        document.documentElement.style.setProperty('--glow-intensity', '0');
    } else {
        glowSlider.disabled = false;
        glowLabel.classList.remove('disabled');
    }
}