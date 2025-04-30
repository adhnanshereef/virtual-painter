document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const video = document.getElementById('video');
    const outputCanvas = document.getElementById('output-canvas');
    const ctx = outputCanvas.getContext('2d');
    const statusDisplay = document.getElementById('status');
    const thicknessSlider = document.getElementById('thickness-slider');
    const clearButton = document.getElementById('clear-canvas');
    const customColorButton = document.getElementById('custom-color');
    const colorButtons = document.querySelectorAll('.color-button');
    const drawModeRadios = document.querySelectorAll('input[name="drawMode"]');
    const adPopup = document.getElementById('ad-popup');
    const closePopupBtn = document.getElementById('close-popup');
    const togglePanelBtn = document.getElementById('toggle-panel');
    const controlPanel = document.querySelector('.control-panel');
    
    // App state
    let drawMode = 'pointing'; // Changed default from 'pinch' to 'pointing'
    let drawingColor = { r: 255, g: 0, b: 0, name: 'Red' };
    let thickness = 5;
    let isDrawing = false;
    let prevX = 0;
    let prevY = 0;
    let drawingLayer = null;
    let canvasScaleFactor = 1; // Used for handling canvas scaling
    
    // Show ad popup on load with a slight delay
    setTimeout(() => {
        adPopup.classList.add('show');
    }, 1000);

    // Close popup event
    closePopupBtn.addEventListener('click', () => {
        adPopup.classList.remove('show');
    });
    
    // Toggle control panel
    togglePanelBtn.addEventListener('click', () => {
        controlPanel.classList.toggle('active');
        togglePanelBtn.classList.toggle('active');
    });
    
    // Initialize camera with proper resolution and orientation
    const initCamera = async () => {
        try {
            // Make video element visible
            video.style.display = 'block';
            
            // First try to get exact screen dimensions
            const constraints = {
                video: {
                    width: { ideal: window.innerWidth },
                    height: { ideal: window.innerHeight },
                    facingMode: "user"
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            // Display status
            updateStatus('Camera initialized. Starting hand tracking...');
            
            // Wait for video to be loaded
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    // Get the actual video dimensions
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    
                    // Set canvas dimensions to match video
                    outputCanvas.width = videoWidth;
                    outputCanvas.height = videoHeight;
                    
                    // Calculate scale factor for coordinate mapping
                    canvasScaleFactor = {
                        x: outputCanvas.width / outputCanvas.clientWidth,
                        y: outputCanvas.height / outputCanvas.clientHeight
                    };
                    
                    // Initialize drawing layer
                    drawingLayer = new ImageData(
                        new Uint8ClampedArray(videoWidth * videoHeight * 4), 
                        videoWidth, 
                        videoHeight
                    );
                    
                    // Fill with transparent pixels
                    for (let i = 0; i < drawingLayer.data.length; i += 4) {
                        drawingLayer.data[i + 3] = 0; // Alpha channel
                    }
                    
                    resolve();
                };
            });
        } catch (error) {
            console.error('Error accessing camera:', error);
            updateStatus('Error: Cannot access camera. Check permissions.');
            alert('Camera access denied. Please allow camera permissions and refresh the page.');
        }
    };
    
    // MediaPipe Hands setup with proper error handling
    const setupMediaPipe = async () => {
        try {
            const hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
            
            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7
            });
            
            hands.onResults(handleResults);
            
            // Create a camera object
            const camera = new Camera(video, {
                onFrame: async () => {
                    await hands.send({image: video});
                },
                width: video.videoWidth,
                height: video.videoHeight,
                mirrored: true // Set to true for proper mirroring
            });
            
            // Start camera
            camera.start();
            updateStatus('Hand tracking started. Ready to draw!');
            
        } catch (error) {
            console.error('Error setting up MediaPipe Hands:', error);
            updateStatus('Error: Could not initialize hand tracking');
        }
    };
    
    // Initialize app
    const initApp = async () => {
        await initCamera();
        await setupMediaPipe();
        
        // Resize handler for responsiveness
        window.addEventListener('resize', handleResize);
        handleResize();
    };
    
    // Handle window resize
    function handleResize() {
        if (!video.videoWidth) return; // Return if video dimensions not yet available
        
        // Calculate scale factor for coordinate mapping
        canvasScaleFactor = {
            x: outputCanvas.width / outputCanvas.clientWidth,
            y: outputCanvas.height / outputCanvas.clientHeight
        };
    }
    
    // Handle hand detection results
    function handleResults(results) {
        // Clear canvas
        ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        
        // Draw the drawing layer
        ctx.putImageData(drawingLayer, 0, 0);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Process landmarks for drawing - apply the same flip as we do for drawing
            // This will make the hand visualization match the drawing position
            const processedLandmarks = landmarks.map(lm => ({
                x: 1 - lm.x,  // Apply same flip as in detectGesture
                y: lm.y,
                z: lm.z
            }));
            
            // Draw hand landmarks - make them less visible
            drawConnectors(ctx, processedLandmarks, HAND_CONNECTIONS, { 
                color: 'rgba(100, 255, 218, 0.3)', 
                lineWidth: 2 
            });
            
            drawLandmarks(ctx, processedLandmarks, { 
                color: 'rgba(100, 255, 218, 0.5)', 
                lineWidth: 1,
                radius: 3 // Smaller landmarks
            });
            
            // Detect gesture with flipped coordinates for drawing
            const gesture = detectGesture(landmarks);
            updateStatus(`Gesture: ${gesture.name}`);
            
            // Handle gesture
            handleGesture(gesture);
        } else {
            // No hands detected
            isDrawing = false;
            prevX = 0;
            prevY = 0;
        }
    }
    
    // Detect hand gesture
    function detectGesture(landmarks) {
        // Extract landmark coordinates with flipped X for proper drawing alignment
        const points = landmarks.map(lm => ({
            // Flip X coordinate (1 - x) to match expected hand position
            x: Math.floor((1 - lm.x) * outputCanvas.width),
            y: Math.floor(lm.y * outputCanvas.height)
        }));
        
        // Check if fingers are extended
        const thumbTip = points[4];
        const indexTip = points[8];
        const indexPip = points[6];
        const middleTip = points[12];
        const middlePip = points[10];
        const ringTip = points[16];
        const ringPip = points[14];
        const pinkyTip = points[20];
        const pinkyPip = points[18];
        
        const indexExtended = indexTip.y < indexPip.y;
        const middleExtended = middleTip.y < middlePip.y;
        const ringExtended = ringTip.y < ringPip.y;
        const pinkyExtended = pinkyTip.y < pinkyPip.y;
        
        // Distance between thumb and index finger for pinch detection
        const pinchDistance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) + 
            Math.pow(thumbTip.y - indexTip.y, 2)
        );
        
        // Adjust pinch threshold based on hand size
        const handSize = Math.sqrt(
            Math.pow(points[0].x - points[17].x, 2) + 
            Math.pow(points[0].y - points[17].y, 2)
        );
        const pinchThreshold = handSize * 0.15; // 15% of hand size for pinch threshold
        
        const isPinching = pinchDistance < pinchThreshold;
        
        // Detect gestures
        if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
            return { name: 'pointing', point: points[8] }; // Use flipped coordinates
        } else if (isPinching) {
            return { name: 'pinch', point: points[8] }; // Use flipped coordinates
        } else if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
            return { name: 'select', point: points[8] }; // Use flipped coordinates
        } else if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
            // Calculate palm center with flipped coordinates
            const palmX = Math.floor(points.reduce((sum, p) => sum + p.x, 0) / points.length);
            const palmY = Math.floor(points.reduce((sum, p) => sum + p.y, 0) / points.length);
            return { name: 'open_hand', point: { x: palmX, y: palmY } };
        } else {
            return { name: 'none', point: null };
        }
    }
    
    // Handle detected gesture
    function handleGesture(gesture) {
        if (gesture.name === 'open_hand' && gesture.point) {
            // Erase mode
            isDrawing = false;
            updateStatus('Erasing with open hand');
            
            // Draw eraser circle for visualization - make it subtle
            const eraserRadius = thickness * 3;
            ctx.beginPath();
            ctx.arc(gesture.point.x, gesture.point.y, eraserRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(100, 255, 218, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Erase on drawing layer
            eraseCircle(gesture.point.x, gesture.point.y, eraserRadius);
        } else if (gesture.name === 'pinch' && drawMode === 'pinch' && gesture.point) {
            // Draw with pinch gesture
            if (prevX > 0 && prevY > 0) {
                drawLine(prevX, prevY, gesture.point.x, gesture.point.y);
            }
            prevX = gesture.point.x;
            prevY = gesture.point.y;
            isDrawing = true;
            updateStatus(`Drawing with pinch - Color: ${drawingColor.name}`);
        } else if (gesture.name === 'pointing' && drawMode === 'pointing' && gesture.point) {
            // Draw with pointing finger
            if (prevX > 0 && prevY > 0) {
                drawLine(prevX, prevY, gesture.point.x, gesture.point.y);
            }
            prevX = gesture.point.x;
            prevY = gesture.point.y;
            isDrawing = true;
            updateStatus(`Drawing with pointing finger - Color: ${drawingColor.name}`);
        } else if (gesture.name === 'pinch' && drawMode === 'pointing') {
            updateStatus("Pinch detected (switch to pinch mode to draw)");
            isDrawing = false;
        } else if (gesture.name === 'pointing' && drawMode === 'pinch') {
            updateStatus("Pointing finger detected (switch to pointing mode to draw)");
            isDrawing = false;
        } else if (gesture.name === 'select' && gesture.point) {
            // Selection mode
            isDrawing = false;
            updateStatus("Selection mode - Two fingers detected");
            
            // Draw selection indicator
            ctx.beginPath();
            ctx.arc(gesture.point.x, gesture.point.y, 15, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(100, 255, 218, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(gesture.point.x - 20, gesture.point.y);
            ctx.lineTo(gesture.point.x + 20, gesture.point.y);
            ctx.moveTo(gesture.point.x, gesture.point.y - 20);
            ctx.lineTo(gesture.point.x, gesture.point.y + 20);
            ctx.strokeStyle = 'rgba(100, 255, 218, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else {
            // No recognized gesture or not in the right mode
            isDrawing = false;
            prevX = 0;
            prevY = 0;
        }
    }
    
    // Draw line on the drawing layer
    function drawLine(x1, y1, x2, y2) {
        const imageData = drawingLayer;
        const { r, g, b } = drawingColor;
        
        // Simple line drawing algorithm (Bresenham's algorithm)
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = (x1 < x2) ? 1 : -1;
        const sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            // Draw a circle at the current point
            drawCircle(x1, y1, thickness, r, g, b);
            
            if (x1 === x2 && y1 === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x1 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y1 += sy;
            }
        }
    }
    
    // Draw circle on the drawing layer
    function drawCircle(centerX, centerY, radius, r, g, b) {
        const imageData = drawingLayer;
        const width = imageData.width;
        const height = imageData.height;
        
        // Bounds checking
        const minX = Math.max(0, centerX - radius);
        const minY = Math.max(0, centerY - radius);
        const maxX = Math.min(width - 1, centerX + radius);
        const maxY = Math.min(height - 1, centerY + radius);
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= radius) {
                    const index = (y * width + x) * 4;
                    imageData.data[index] = r;     // R
                    imageData.data[index + 1] = g; // G
                    imageData.data[index + 2] = b; // B
                    imageData.data[index + 3] = 255; // A
                }
            }
        }
    }
    
    // Erase circle on the drawing layer
    function eraseCircle(centerX, centerY, radius) {
        const imageData = drawingLayer;
        const width = imageData.width;
        const height = imageData.height;
        
        // Bounds checking
        const minX = Math.max(0, centerX - radius);
        const minY = Math.max(0, centerY - radius);
        const maxX = Math.min(width - 1, centerX + radius);
        const maxY = Math.min(height - 1, centerY + radius);
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= radius) {
                    const index = (y * width + x) * 4;
                    imageData.data[index + 3] = 0; // Set alpha to 0 (transparent)
                }
            }
        }
    }
    
    // Clear canvas
    function clearCanvas() {
        if (drawingLayer) {
            // Set all pixels to transparent
            for (let i = 0; i < drawingLayer.data.length; i += 4) {
                drawingLayer.data[i + 3] = 0; // Alpha channel
            }
            updateStatus('Canvas cleared');
        }
    }
    
    // Update status display with animation
    function updateStatus(message) {
        statusDisplay.textContent = message;
        statusDisplay.classList.add('highlight');
        setTimeout(() => {
            statusDisplay.classList.remove('highlight');
        }, 300);
    }
    
    // Set up event listeners
    clearButton.addEventListener('click', clearCanvas);
    
    thicknessSlider.addEventListener('input', () => {
        thickness = parseInt(thicknessSlider.value);
        updateStatus(`Brush thickness set to ${thickness}`);
    });
    
    colorButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            colorButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Set color
            const colorValues = button.dataset.color.split(',');
            drawingColor = {
                r: parseInt(colorValues[0]),
                g: parseInt(colorValues[1]),
                b: parseInt(colorValues[2]),
                name: button.dataset.name
            };
            
            updateStatus(`Color set to ${drawingColor.name}`);
        });
    });
    
    customColorButton.addEventListener('click', () => {
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.click();
        
        colorPicker.addEventListener('input', () => {
            const hex = colorPicker.value;
            
            // Convert hex to RGB
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            
            drawingColor = { r, g, b, name: hex };
            
            // Remove active class from all buttons
            colorButtons.forEach(btn => btn.classList.remove('active'));
            
            updateStatus(`Custom color set to ${hex}`);
        });
    });
    
    drawModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            drawMode = radio.value;
            updateStatus(`Drawing mode set to ${drawMode === 'pinch' ? 'pinch gesture' : 'pointing finger'}`);
        });
    });
    
    // MediaPipe hand connections - define it explicitly
    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],  // Index finger
        [5, 9], [9, 10], [10, 11], [11, 12],  // Middle finger
        [9, 13], [13, 14], [14, 15], [15, 16],  // Ring finger
        [13, 17], [17, 18], [18, 19], [19, 20],  // Pinky
        [0, 17], [5, 9], [9, 13], [13, 17]  // Palm
    ];
    
    // Helper function to draw landmarks (simplified version)
    function drawLandmarks(ctx, landmarks, options = {}) {
        if (!landmarks) return;
        
        const radius = options.radius || 5;
        ctx.fillStyle = options.color || 'red';
        
        for (const landmark of landmarks) {
            const x = landmark.x * ctx.canvas.width;
            const y = landmark.y * ctx.canvas.height;
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    // Helper function to draw connectors between landmarks
    function drawConnectors(ctx, landmarks, connections, options = {}) {
        if (!landmarks || !connections) return;
        
        ctx.strokeStyle = options.color || 'white';
        ctx.lineWidth = options.lineWidth || 1;
        
        for (const connection of connections) {
            const [i, j] = connection;
            const start = landmarks[i];
            const end = landmarks[j];
            
            if (start && end) {
                ctx.beginPath();
                ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
                ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
                ctx.stroke();
            }
        }
    }
    
    // Add visual feedback for button clicks
    document.querySelectorAll('.button').forEach(button => {
        button.addEventListener('mousedown', function() {
            this.style.transform = 'scale(0.95) translateY(2px)';
        });
        
        button.addEventListener('mouseup', function() {
            this.style.transform = '';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
    
    // Auto-hide control panel when drawing
    setInterval(() => {
        if (isDrawing && controlPanel.classList.contains('active')) {
            controlPanel.classList.remove('active');
            togglePanelBtn.classList.remove('active');
        }
    }, 3000); // Check every 3 seconds
    
    // Start the application
    initApp().catch(error => {
        console.error('Failed to initialize app:', error);
        updateStatus('Error initializing application. Please refresh.');
    });
});
