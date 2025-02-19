// DOM Elements
const drawer = document.querySelector('.drawer');
const drawerToggle = document.querySelector('.drawer-toggle');
const canvas = document.getElementById('canvas');
const warmthSlider = document.getElementById('warmth');
const ambientSlider = document.getElementById('ambient');
const lockCanvasControl = document.getElementById('canvasLock');
const illuminateFullSurfaceBtn = document.getElementById('illuminateFullSurface');
const redSlider = document.getElementById('redSlider');
const greenSlider = document.getElementById('greenSlider');
const blueSlider = document.getElementById('blueSlider');
const redValue = document.getElementById('redValue');
const greenValue = document.getElementById('greenValue');
const blueValue = document.getElementById('blueValue');
const resetRGBBtn = document.getElementById('resetRGB');

// State variables
let selectedShape = null;
let isLocked = false;
let isFullyIlluminated = false;
let previousAmbientValue = 0;
let baseColor = [255, 255, 255];

// Full screen functionality
const fullscreenToggle = document.getElementById('fullscreenToggle');

fullscreenToggle.addEventListener('change', () => {
    if (fullscreenToggle.checked) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
});

// Update checkbox state when fullscreen changes
document.addEventListener('fullscreenchange', () => {
    fullscreenToggle.checked = document.fullscreenElement !== null;
});
document.addEventListener('webkitfullscreenchange', () => {
    fullscreenToggle.checked = document.webkitFullscreenElement !== null;
});
document.addEventListener('msfullscreenchange', () => {
    fullscreenToggle.checked = document.msFullscreenElement !== null;
});

// Drawer scrolling functionality
let touchStartY = 0;
let scrollStartY = 0;

drawer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scrollSpeed = 1.5;
    drawer.scrollTop += e.deltaY * scrollSpeed;
}, { passive: false });

drawer.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    scrollStartY = drawer.scrollTop;
}, { passive: true });

drawer.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const diff = touchStartY - touchY;
    drawer.scrollTop = scrollStartY + diff;
}, { passive: true });

// Drawer toggle
drawerToggle.addEventListener('click', () => {
    drawer.classList.toggle('open');
});

drawerToggle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    drawer.classList.toggle('open');
}, { passive: false });

// RGB Controls collapsible section
const rgbSection = document.querySelector('.collapsible-section');
const rgbHeader = rgbSection.querySelector('.collapsible-header');
const rgbContent = rgbSection.querySelector('.collapsible-content');

rgbHeader.addEventListener('click', () => {
    const isOpen = rgbSection.classList.toggle('open');
    if (isOpen) {
        const contentHeight = rgbContent.scrollHeight;
        rgbContent.style.height = contentHeight + 'px';
    } else {
        rgbContent.style.height = '0';
    }
});

// Color management functions
function getWarmColor(warmth) {
    const r = baseColor[0];
    const g = Math.round(baseColor[1] * (0.93 + (warmth * 0.0007)));
    const b = Math.round(baseColor[2] * (0.84 + (warmth * 0.0016)));
    return [r, g, b];
}

function updateRGBValues() {
    baseColor = [
        parseInt(redSlider.value),
        parseInt(greenSlider.value),
        parseInt(blueSlider.value)
    ];
    redValue.textContent = baseColor[0];
    greenValue.textContent = baseColor[1];
    blueValue.textContent = baseColor[2];
    
    document.querySelectorAll('.shape').forEach(updateShapeColor);
    updateBackground();
}

function resetRGB() {
    redSlider.value = 255;
    greenSlider.value = 255;
    blueSlider.value = 255;
    updateRGBValues();
}

function updateBackground() {
    const warmth = warmthSlider.value;
    const ambient = ambientSlider.value;
    const warmColor = getWarmColor(warmth);
    const bgColor = warmColor.map(c => Math.round(c * (ambient / 100)));
    canvas.style.backgroundColor = `rgb(${bgColor.join(',')})`;
}

function updateShapeColor(shape) {
    const warmColor = getWarmColor(warmthSlider.value);
    shape.style.backgroundColor = `rgb(${warmColor.join(',')})`;
}

// Shape management functions
function createBoundingBox(shape) {
    const box = document.createElement('div');
    box.className = 'bounding-box';
    box.dataset.shape = shape.dataset.shape;
    
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    box.appendChild(handle);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-button';
    deleteBtn.innerHTML = '×';
    box.appendChild(deleteBtn);

    // Set initial position and size
    box.style.width = shape.style.width;
    box.style.height = shape.style.height;
    box.style.left = shape.style.left;
    box.style.top = shape.style.top;
    if (shape.classList.contains('circle')) {
        box.style.borderRadius = '50%';
    }

    return box;
}

function updateBoundingBox(shape) {
    const box = shape.boundingBox;
    box.style.width = shape.style.width;
    box.style.height = shape.style.height;
    box.style.left = shape.style.left;
    box.style.top = shape.style.top;
}

// Event listeners for color controls
redSlider.addEventListener('input', updateRGBValues);
greenSlider.addEventListener('input', updateRGBValues);
blueSlider.addEventListener('input', updateRGBValues);
resetRGBBtn.addEventListener('click', resetRGB);

// Shape creation and interaction
document.querySelectorAll('.shape-button').forEach(button => {
    if (button.id === 'illuminateFullSurface') return;
    
    let offset = 0; // Track shape offset

    button.addEventListener('click', createShape);
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        createShape();
    }, { passive: false });

    function createShape() {
        // Get the center of the viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Create shape with larger initial size
        const shape = document.createElement('div');
        shape.className = `shape ${button.dataset.shape}`;
        shape.dataset.shape = button.dataset.shape;
        const initialSize = 200; // Keep initial size larger than minimum
        const minSize = 100;  // Define minimum size
        shape.style.width = `${Math.max(initialSize, minSize)}px`;
        shape.style.height = `${Math.max(initialSize, minSize)}px`;

        // Position in center with offset
        shape.style.left = `${(viewportWidth - initialSize) / 2 + offset}px`;
        shape.style.top = `${(viewportHeight - initialSize) / 2 + offset}px`;
        
        // Increment offset for next shape
        offset = (offset + 20) % 100; // Reset after 5 shapes to prevent too much spread

        updateShapeColor(shape);
        
        const boundingBox = createBoundingBox(shape);
        canvas.appendChild(boundingBox);
        shape.boundingBox = boundingBox;
        
        canvas.appendChild(shape);
        setupShapeInteraction(shape);
    }
});

function setupShapeInteraction(shape) {
    let isDragging = false;
    let isResizing = false;
    let initialRect, startX, startY;

    // Mouse Events
    shape.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);

    // Touch Events
    shape.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);

    // Handle both mouse and touch start
    function handleStart(e) {
        if (isLocked) return;

        // Prevent scrolling while dragging on mobile
        e.preventDefault();
        
        if (selectedShape && selectedShape !== shape) {
            selectedShape.boundingBox.style.display = 'none';
        }
        selectedShape = shape;
        shape.boundingBox.style.display = 'block';

        const touch = e.touches ? e.touches[0] : e;
        initialRect = shape.getBoundingClientRect();
        startX = touch.clientX;
        startY = touch.clientY;
        
        if (!e.target.classList.contains('resize-handle')) {
            isDragging = true;
        }
    }

    // Handle both mouse and touch move
    function handleMove(e) {
        if (isLocked || (!isDragging && !isResizing)) return;

        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        
        if (isResizing) {
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            // Allow independent width and height changes for squares
            if (shape.dataset.shape === 'square') {
                const minSize = 100; // Increased minimum size for better interaction
                const newWidth = Math.max(minSize, initialRect.width + dx);
                const newHeight = Math.max(minSize, initialRect.height + dy);
                
                shape.style.width = `${newWidth}px`;
                shape.style.height = `${newHeight}px`;
            } else {
                // Circles maintain aspect ratio
                const dragDistance = Math.max(dx, dy);
                const minSize = 100; // Increased minimum size for better interaction
                const newSize = Math.max(minSize, initialRect.width + dragDistance);
                
                shape.style.width = `${newSize}px`;
                shape.style.height = `${newSize}px`;
            }
            
            updateBoundingBox(shape);
        }
        else if (isDragging) {
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            
            shape.style.left = `${initialRect.left + dx}px`;
            shape.style.top = `${initialRect.top + dy}px`;
            updateBoundingBox(shape);
        }
    }

    // Handle both mouse and touch end
    function handleEnd() {
        isDragging = false;
        isResizing = false;
    }

    // Resize handle events
    const resizeHandle = shape.boundingBox.querySelector('.resize-handle');
    resizeHandle.addEventListener('mousedown', handleResizeStart);
    resizeHandle.addEventListener('touchstart', handleResizeStart, { passive: false });

    function handleResizeStart(e) {
        if (isLocked) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        isResizing = true;
        const touch = e.touches ? e.touches[0] : e;
        initialRect = shape.getBoundingClientRect();
        startX = touch.clientX;
        startY = touch.clientY;
    }

    // Delete button events
    const deleteBtn = shape.boundingBox.querySelector('.delete-button');
    deleteBtn.addEventListener('mousedown', handleDelete);
    deleteBtn.addEventListener('touchstart', handleDelete, { passive: false });

    function handleDelete(e) {
        if (isLocked) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        shape.remove();
        shape.boundingBox.remove();
        selectedShape = null;
    }
}

// Full surface illumination
illuminateFullSurfaceBtn.addEventListener('click', toggleFullSurface);
illuminateFullSurfaceBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleFullSurface();
}, { passive: false });

function toggleFullSurface() {
    isFullyIlluminated = !isFullyIlluminated;
    illuminateFullSurfaceBtn.classList.toggle('active', isFullyIlluminated);

    if (isFullyIlluminated) {
        previousAmbientValue = ambientSlider.value;
        ambientSlider.value = 100;
    } else {
        ambientSlider.value = previousAmbientValue;
    }
    updateBackground();
}

// Canvas lock functionality
lockCanvasControl.addEventListener('change', (e) => {
    isLocked = e.target.checked;
    const shapes = document.querySelectorAll('.shape');
    
    shapes.forEach(shape => {
        if (isLocked) {
            shape.classList.add('locked');
            if (shape.boundingBox) {
                shape.boundingBox.style.display = 'none';
            }
        } else {
            shape.classList.remove('locked');
        }
    });

    if (isLocked && selectedShape) {
        selectedShape.boundingBox.style.display = 'none';
        selectedShape = null;
    }
});

// Light control listeners
warmthSlider.addEventListener('input', () => {
    document.querySelectorAll('.shape').forEach(updateShapeColor);
    updateBackground();
});

ambientSlider.addEventListener('input', updateBackground);

// Canvas click handler
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('touchstart', handleCanvasClick);

function handleCanvasClick(e) {
    if (e.target === canvas && selectedShape) {
        selectedShape.boundingBox.style.display = 'none';
        selectedShape = null;
    }
}