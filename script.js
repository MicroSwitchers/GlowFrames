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
    checkIOSFullscreen: () => {
        if (Platform.isIOS() && !Platform.isStandalone()) {
            alert("For fullscreen mode on iPhone, add this app to your home screen and open it from there.");
        }
    }
};

// Color management
const ColorManager = {
    updateWarmColor: (warmth) => {
        const r = AppState.baseColor[0];
        const g = Math.round(AppState.baseColor[1] * (0.93 + (warmth * 0.0007)));
        const b = Math.round(AppState.baseColor[2] * (0.84 + (warmth * 0.0016)));
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
        let startX, startY, startWidth, startHeight;

        const startResize = (e) => {
            if (AppState.isLocked) return;
            e.preventDefault();
            e.stopPropagation();
            
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            startWidth = parseInt(shape.style.width);
            startHeight = parseInt(shape.style.height);

            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchmove', resize);
            document.addEventListener('touchend', stopResize);
        };

        const resize = (e) => {
            if (AppState.isLocked) return;
            e.preventDefault();
            e.stopPropagation();
            
            const touch = e.touches ? e.touches[0] : e;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            if (shape.classList.contains('circle')) {
                // Keep aspect ratio for circles
                const newSize = Math.max(startWidth + Math.max(dx, dy), 50);
                shape.style.width = `${newSize}px`;
                shape.style.height = `${newSize}px`;
            } else {
                // Allow rectangular shapes
                const newWidth = Math.max(startWidth + dx, 50);
                const newHeight = Math.max(startHeight + dy, 50);
                shape.style.width = `${newWidth}px`;
                shape.style.height = `${newHeight}px`;
            }

            // Update bounding box size
            BoundingBoxManager.updatePosition(shape);
        };

        const stopResize = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchmove', resize);
            document.removeEventListener('touchend', stopResize);
            
            // Hide bounding box after resize
            BoundingBoxManager.hide(shape);
            AppState.selectedShape = null;
        };

        // Add event listeners
        handle.addEventListener('mousedown', startResize);
        handle.addEventListener('touchstart', startResize);
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
        let initialX, initialY, startX, startY;

        const handleClick = (e) => {
            if (AppState.isLocked) return;
            
            // Deselect previous shape if different
            if (AppState.selectedShape && AppState.selectedShape !== shape) {
                BoundingBoxManager.hide(AppState.selectedShape);
            }
            
            // Select this shape
            AppState.selectedShape = shape;
            BoundingBoxManager.show(shape);
            
            shape.focus();
            e.stopPropagation();
        };

        const startDrag = (e) => {
            if (AppState.isLocked) return;
            
            // Select this shape when starting drag
            handleClick(e);
            
            isDragging = true;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            initialX = parseInt(shape.style.left);
            initialY = parseInt(shape.style.top);
        };

        const drag = (e) => {
            if (!isDragging || AppState.isLocked) return;
            
            const touch = e.touches ? e.touches[0] : e;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            
            shape.style.left = `${initialX + dx}px`;
            shape.style.top = `${initialY + dy}px`;
            
            // Update bounding box position
            BoundingBoxManager.updatePosition(shape);
        };

        const stopDrag = () => {
            isDragging = false;
        };

        shape.addEventListener('mousedown', startDrag);
        shape.addEventListener('touchstart', startDrag);
        shape.addEventListener('click', handleClick);
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
    }
};

// Fullscreen management
const FullscreenManager = {
    isInFullScreen: () => {
        return Boolean(
            document.fullscreenElement || 
            document.webkitFullscreenElement || 
            document.mozFullscreenElement ||
            document.msFullscreenElement
        );
    },
    
    requestFullscreen: (element) => {
        try {
            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) { /* Safari */
                element.webkitRequestFullscreen();
            } else if (element.msRequestFullscreen) { /* IE11 */
                element.msRequestFullscreen();
            }
        } catch (error) {
            console.error("Fullscreen request failed:", error);
        }
    },
    
    exitFullscreen: () => {
        try {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE11 */
                document.msExitFullscreen();
            }
        } catch (error) {
            console.error("Exit fullscreen failed:", error);
        }
    },
    
    toggle: () => {
        if (Elements.controls.fullscreen.checked) {
            if (Platform.isIOS()) {
                alert("Fullscreen mode is not supported in iOS browsers. Add this app to your home screen.");
                Elements.controls.fullscreen.checked = false;
            } else if (!FullscreenManager.isInFullScreen()) {
                FullscreenManager.requestFullscreen(document.documentElement);
            }
        } else if (FullscreenManager.isInFullScreen()) {
            FullscreenManager.exitFullscreen();
        }
    },

    handleChange: () => {
        Elements.controls.fullscreen.checked = FullscreenManager.isInFullScreen();
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
    // Drawer toggle
    const handleDrawerToggle = () => {
        Elements.drawer.classList.toggle('open');
        // Hide all shape controls when drawer opens
        document.querySelectorAll('.shape').forEach(shape => 
            BoundingBoxManager.hide(shape));
    };

    Elements.drawerToggle.addEventListener('click', handleDrawerToggle);
    Elements.drawerToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDrawerToggle();
    }, { passive: false });

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

    // Fullscreen
    Elements.controls.fullscreen.addEventListener('change', FullscreenManager.toggle);
    document.addEventListener('fullscreenchange', FullscreenManager.handleChange);
    document.addEventListener('webkitfullscreenchange', FullscreenManager.handleChange);
    document.addEventListener('msfullscreenchange', FullscreenManager.handleChange);

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
    Elements.canvas.addEventListener('mousedown', (event) => {
        if (event.target === Elements.canvas) {
            // Hide all bounding boxes when clicking canvas
            document.querySelectorAll('.bounding-box').forEach(box => {
                box.style.display = 'none';
            });
            AppState.selectedShape = null;
        }
    });

    Elements.controls.glowSlider.addEventListener('input', updateGlowIntensity);
}

// Use event delegation instead of multiple listeners
document.addEventListener('click', (e) => {
    if (e.target.matches('.shape')) {
        // Handle shape click
    } else if (e.target.matches('.delete-button')) {
        // Handle delete
    }
});

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
        window.addEventListener('error', this.handleError);
        window.addEventListener('unhandledrejection', this.handlePromiseError);
    },

    handleError(event) {
        console.error('Application error:', event.error);
        // Attempt recovery
        BoundingBoxManager.hideAll();
        AppState.isLocked = false;
    },

    handlePromiseError(event) {
        console.error('Promise error:', event.reason);
    }
};

const StateManager = {
    saveState() {
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
                ambient: Elements.controls.ambient.value,
                warmth: Elements.controls.warmth.value,
                glow: Elements.controls.glowSlider.value
            }
        };
        localStorage.setItem('lightboxState', JSON.stringify(state));
    },

    restoreState() {
        try {
            const saved = localStorage.getItem('lightboxState');
            if (saved) {
                const state = JSON.parse(saved);
                // Restore settings
                Object.entries(state.settings).forEach(([key, value]) => {
                    if (Elements.controls[key]) {
                        Elements.controls[key].value = value;
                    }
                });
            }
        } catch (error) {
            console.error('Failed to restore state:', error);
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