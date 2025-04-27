import cv2
import numpy as np
import mediapipe as mp
import tkinter as tk
from tkinter import colorchooser, ttk
from PIL import Image, ImageTk
import math
import os

class HandGestureDrawingApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Hand Gesture Drawing App")
        self.root.configure(bg="#212121")  # Dark theme background
        
        # Set window to fullscreen
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        self.root.geometry(f"{screen_width}x{screen_height}")
        
        # Store frame as attribute
        self.frame = None
        
        # For color name tracking
        self.color_name = "Red"
        
        # Initialize MediaPipe hands
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_drawing = mp.solutions.drawing_utils
        
        # Initialize drawing variables
        self.is_drawing = False
        self.draw_mode = "pinch"  # Default drawing mode (pinch or pointing)
        self.prev_x, self.prev_y = 0, 0
        self.color = (0, 0, 255)  # Default color (red in BGR)
        self.thickness = 5
        self.frame = None
        self.drawing_layer = None
        self.status = "Ready"
        
        # Ad properties
        self.ad_width = 300  # Width of the ad panel
        self.show_ad = True  # Flag to control ad visibility
        self.ad_bg_color = "#1a1a1a"  # Dark background for ad
        
        # Try to load QR code image
        self.qr_image = None
        try:
            qr_path = "day-qr.png"
            if os.path.exists(qr_path):
                qr_img = Image.open(qr_path)
                self.qr_image = ImageTk.PhotoImage(qr_img.resize((200, 200), Image.LANCZOS))
        except Exception as e:
            print(f"Error loading QR code: {e}")
        
        # Initialize camera
        self.cap = cv2.VideoCapture(0)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        # Create UI
        self.create_ui()
        
        # Start updating the frame
        self.update_frame()
        
    def create_ui(self):
        # Main frame for camera view
        camera_frame_height = self.root.winfo_screenheight() - 150  # Reserve space for control panel
        
        # Create main content frame to hold camera and ad side by side
        main_content = tk.Frame(self.root, bg="#212121")
        main_content.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        # Camera frame on the left
        self.camera_frame = tk.Frame(main_content, bg="#212121")
        self.camera_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Ad frame on the right
        self.ad_frame = tk.Frame(main_content, bg=self.ad_bg_color, width=self.ad_width)
        self.ad_frame.pack(side=tk.RIGHT, fill=tk.Y)
        # Make sure ad frame maintains its width
        self.ad_frame.pack_propagate(False)
        
        # Camera canvas - set fixed size
        self.canvas_width = 1280 - self.ad_width  # Adjusted to leave space for ad
        self.canvas_height = camera_frame_height
        self.canvas = tk.Canvas(self.camera_frame, bg="black", width=self.canvas_width, height=self.canvas_height)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        
        # Add ad content
        self.create_ad_content()
        
        # Control panel (at the bottom)
        self.control_panel = tk.Frame(self.root, bg="#333333", height=150)
        self.control_panel.pack(side=tk.BOTTOM, fill=tk.X)
        
        # Left section - Drawing modes
        mode_frame = tk.LabelFrame(self.control_panel, text="Drawing Mode", font=("Arial", 12), fg="white", bg="#333333")
        mode_frame.pack(side=tk.LEFT, padx=20, pady=10, fill=tk.Y)
        
        self.mode_var = tk.StringVar(value="pinch")
        tk.Radiobutton(mode_frame, text="Pinch to Draw", variable=self.mode_var, value="pinch", 
                       command=self.set_draw_mode, bg="#333333", fg="white", selectcolor="#555555", font=("Arial", 10)).pack(anchor=tk.W, pady=2)
        tk.Radiobutton(mode_frame, text="Pointing Finger to Draw", variable=self.mode_var, value="pointing", 
                      command=self.set_draw_mode, bg="#333333", fg="white", selectcolor="#555555", font=("Arial", 10)).pack(anchor=tk.W, pady=2)
        
        # Middle section - Tools
        tools_frame = tk.LabelFrame(self.control_panel, text="Tools", font=("Arial", 12), fg="white", bg="#333333")
        tools_frame.pack(side=tk.LEFT, padx=20, pady=10, fill=tk.Y)
        
        # Clear button
        tk.Button(tools_frame, text="Clear Canvas", command=self.clear_canvas, bg="#555555", fg="white", 
                  font=("Arial", 10), padx=10, pady=5).pack(side=tk.LEFT, padx=5)
        
        # Thickness slider
        thickness_frame = tk.Frame(tools_frame, bg="#333333")
        thickness_frame.pack(side=tk.LEFT, padx=10)
        tk.Label(thickness_frame, text="Thickness:", bg="#333333", fg="white", font=("Arial", 10)).pack(anchor=tk.W)
        self.thickness_slider = tk.Scale(thickness_frame, from_=1, to=20, orient=tk.HORIZONTAL, bg="#333333", fg="white",
                                         highlightthickness=0, command=self.set_thickness)
        self.thickness_slider.set(5)
        self.thickness_slider.pack(fill=tk.X)
        
        # Color section
        color_frame = tk.LabelFrame(self.control_panel, text="Colors", font=("Arial", 12), fg="white", bg="#333333")
        color_frame.pack(side=tk.LEFT, padx=20, pady=10, fill=tk.Y)
        
        # Predefined colors
        color_buttons_frame = tk.Frame(color_frame, bg="#333333")
        color_buttons_frame.pack(side=tk.TOP, fill=tk.X, pady=5)
        
        colors = [
            ("#FF0000", "Red"), 
            ("#00FF00", "Green"), 
            ("#0000FF", "Blue"),
            ("#FFFF00", "Yellow"), 
            ("#FF00FF", "Purple"), 
            ("#FFFFFF", "White")
        ]
        
        for hex_color, name in colors:
            # Convert hex to RGB and then to BGR for OpenCV
            r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (1, 3, 5))
            bgr = (b, g, r)
            
            btn = tk.Button(color_buttons_frame, bg=hex_color, width=3, height=1, 
                           command=lambda c=bgr, n=name: self.set_color(c, n))
            btn.pack(side=tk.LEFT, padx=2)
        
        # Custom color picker
        tk.Button(color_frame, text="Custom Color", command=self.pick_color, bg="#555555", 
                  fg="white", font=("Arial", 10), padx=5, pady=2).pack(pady=5)
                  
        # Status section
        status_frame = tk.LabelFrame(self.control_panel, text="Status", font=("Arial", 12), fg="white", bg="#333333")
        status_frame.pack(side=tk.LEFT, padx=20, pady=10, fill=tk.BOTH, expand=True)
        
        self.status_label = tk.Label(status_frame, text="Ready", bg="#212121", fg="white", font=("Arial", 12),
                                    width=20, height=2)
        self.status_label.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)
        
        # Gesture guide section
        guide_frame = tk.LabelFrame(self.control_panel, text="Gesture Guide", font=("Arial", 12), fg="white", bg="#333333")
        guide_frame.pack(side=tk.RIGHT, padx=20, pady=10, fill=tk.Y)
        
        gestures = [
            "✋ Open Hand: Erase",
            "👆 Pointing: Draw (if mode selected)",
            "👌 Pinch: Draw (if mode selected)",
            "✌️ Two Fingers: Select",
        ]
        
        for gesture in gestures:
            tk.Label(guide_frame, text=gesture, bg="#333333", fg="white", font=("Arial", 10), 
                    anchor=tk.W).pack(pady=2, fill=tk.X)
    
    def create_ad_content(self):
        # Ad title
        tk.Label(self.ad_frame, text="Day App", font=("Arial", 24, "bold"), 
                bg=self.ad_bg_color, fg="#800080", pady=20).pack(pady=(50, 10))
        
        # Tagline
        tk.Label(self.ad_frame, text="Organize your World with Day", 
                font=("Arial", 14), bg=self.ad_bg_color, fg="white").pack(pady=10)
        
        # Link
        link_label = tk.Label(self.ad_frame, text="day.adhnan.tech", 
                            font=("Arial", 12, "underline"), bg=self.ad_bg_color, 
                            fg="#64B5F6", cursor="hand2")
        link_label.pack(pady=10)
        
        # Add some spacing
        tk.Frame(self.ad_frame, height=30, bg=self.ad_bg_color).pack()
        
        # QR code (if loaded)
        if self.qr_image:
            qr_label = tk.Label(self.ad_frame, image=self.qr_image, bg=self.ad_bg_color)
            qr_label.pack(pady=20)
        else:
            # Placeholder for QR code if image not loaded
            qr_placeholder = tk.Frame(self.ad_frame, width=200, height=200, bg="#333333")
            qr_placeholder.pack(pady=20)
            tk.Label(qr_placeholder, text="QR Code", font=("Arial", 14), 
                    bg="#333333", fg="white").place(relx=0.5, rely=0.5, anchor=tk.CENTER)
            
        # Bottom call to action
        tk.Button(self.ad_frame, text="Learn More", font=("Arial", 12, "bold"), 
                 bg="#4CAF50", fg="white", padx=15, pady=8).pack(pady=30)
    
    def set_draw_mode(self):
        self.draw_mode = self.mode_var.get()
        self.update_status(f"Drawing mode: {self.draw_mode}")
        
    def set_thickness(self, val):
        self.thickness = int(val)
        
    def set_color(self, color, name=None):
        self.color = color
        if name:
            self.color_name = name
        else:
            hex_color = f'#{color[2]:02x}{color[1]:02x}{color[0]:02x}'  # Convert BGR to HEX
            self.color_name = hex_color
        self.update_status(f"Color set to {self.color_name}")
        
    def pick_color(self):
        color = colorchooser.askcolor(title="Choose Color")
        if color[0]:  # If color is selected
            r, g, b = [int(c) for c in color[0]]
            self.color = (b, g, r)  # Convert RGB to BGR
            self.color_name = color[1]  # Hex color
            
    def clear_canvas(self):
        if self.drawing_layer is not None:
            self.drawing_layer = np.zeros_like(self.drawing_layer)
            self.update_status("Canvas cleared")
            
    def update_status(self, message):
        self.status = message
        self.status_label.config(text=message)
    
    def detect_gesture(self, hand_landmarks, frame):
        # Extract landmark coordinates
        points = []
        for landmark in hand_landmarks.landmark:
            x = int(landmark.x * frame.shape[1])
            y = int(landmark.y * frame.shape[0])
            points.append((x, y))
        
        # Get finger states (extended or not)
        # Thumb
        thumb_tip = points[4]
        thumb_ip = points[3]
        
        # Index finger
        index_tip = points[8]
        index_pip = points[6]
        
        # Middle finger
        middle_tip = points[12]
        middle_pip = points[10]
        
        # Ring finger
        ring_tip = points[16]
        ring_pip = points[14]
        
        # Pinky
        pinky_tip = points[20]
        pinky_pip = points[18]
        
        # Check if fingers are extended
        index_extended = index_tip[1] < index_pip[1]
        middle_extended = middle_tip[1] < middle_pip[1]
        ring_extended = ring_tip[1] < ring_pip[1]
        pinky_extended = pinky_tip[1] < pinky_pip[1]
        
        # Distance between thumb and index finger for pinch detection
        pinch_distance = math.dist(thumb_tip, index_tip)
        is_pinching = pinch_distance < 40  # Threshold for pinch
        
        # Detect gestures
        if index_extended and not middle_extended and not ring_extended and not pinky_extended:
            return "pointing", index_tip
        elif is_pinching:
            return "pinch", index_tip
        elif index_extended and middle_extended and not ring_extended and not pinky_extended:
            return "select", index_tip
        elif index_extended and middle_extended and ring_extended and pinky_extended:
            return "open_hand", None
        else:
            return "none", None
    
    def update_frame(self):
        ret, frame = self.cap.read()
        if ret:
            frame = cv2.flip(frame, 1)  # Mirror the frame for more intuitive interaction
            self.frame = frame.copy()  # Store frame as attribute
            
            if self.drawing_layer is None:
                self.drawing_layer = np.zeros_like(frame)
            
            # Process the frame with MediaPipe
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(frame_rgb)
            
            # Initialize a copy for displaying
            display_frame = frame.copy()
            
            # Overlay the drawing layer
            mask = cv2.cvtColor(self.drawing_layer, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
            display_frame = cv2.bitwise_and(display_frame, display_frame, mask=cv2.bitwise_not(mask))
            display_frame = cv2.add(display_frame, self.drawing_layer)
            
            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    # Draw hand landmarks for visualization
                    self.mp_drawing.draw_landmarks(
                        display_frame, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)
                    
                    # Detect gesture and get drawing point
                    gesture, point = self.detect_gesture(hand_landmarks, frame)
                    
                    # Update status
                    self.update_status(f"Gesture: {gesture}")
                    
                    # Handle different gestures
                    if gesture == "open_hand":
                        # Erase mode
                        self.is_drawing = False
                        self.update_status("Erasing with open hand")
                        
                        # Extract landmark coordinates for palm center calculation
                        points = [(int(landmark.x * frame.shape[1]), int(landmark.y * frame.shape[0])) 
                                  for landmark in hand_landmarks.landmark]
                        
                        # Get the position of palm center for erasing
                        palm_center_x = int(sum(p[0] for p in points) / len(points))
                        palm_center_y = int(sum(p[1] for p in points) / len(points))
                        
                        # Draw eraser circle on display for visualization
                        cv2.circle(display_frame, (palm_center_x, palm_center_y), 
                                   self.thickness * 3, (0, 255, 255), 2)
                        
                        # Actually erase on the drawing layer
                        cv2.circle(self.drawing_layer, (palm_center_x, palm_center_y), 
                                   self.thickness * 3, (0, 0, 0), -1)
                    
                    elif gesture == "pinch" and self.draw_mode == "pinch":
                        # Draw with pinch gesture
                        if point:
                            x, y = point
                            if self.prev_x > 0 and self.prev_y > 0:
                                cv2.line(self.drawing_layer, (self.prev_x, self.prev_y), 
                                         (x, y), self.color, self.thickness)
                            self.prev_x, self.prev_y = x, y
                            self.is_drawing = True
                            self.update_status(f"Drawing with pinch - Color: {self.color_name}")
                    
                    elif gesture == "pointing" and self.draw_mode == "pointing":
                        # Draw with pointing finger
                        if point:
                            x, y = point
                            if self.prev_x > 0 and self.prev_y > 0:
                                cv2.line(self.drawing_layer, (self.prev_x, self.prev_y), 
                                         (x, y), self.color, self.thickness)
                            self.prev_x, self.prev_y = x, y
                            self.is_drawing = True
                            self.update_status(f"Drawing with pointing finger - Color: {self.color_name}")
                    
                    elif gesture == "pinch" and self.draw_mode == "pointing":
                        self.update_status("Pinch detected (switch to pinch mode to draw)")
                        self.is_drawing = False
                        
                    elif gesture == "pointing" and self.draw_mode == "pinch":
                        self.update_status("Pointing finger detected (switch to pointing mode to draw)")
                        self.is_drawing = False
                    
                    elif gesture == "select":
                        # Selection mode - could be extended to select colors, etc.
                        self.is_drawing = False
                        self.update_status("Selection mode - Two fingers detected")
                        
                        # Show selection indicator in display frame
                        if point:
                            cv2.circle(display_frame, point, 15, (255, 255, 0), 2)
                            cv2.line(display_frame, (point[0]-20, point[1]), (point[0]+20, point[1]), (255, 255, 0), 2)
                            cv2.line(display_frame, (point[0], point[1]-20), (point[0], point[1]+20), (255, 255, 0), 2)
                    
                    else:
                        # No recognized gesture or not in the right mode
                        self.is_drawing = False
                        self.prev_x, self.prev_y = 0, 0
            else:
                # No hands detected
                self.is_drawing = False
                self.prev_x, self.prev_y = 0, 0
            
            # Convert frame to PhotoImage for Tkinter
            img = cv2.cvtColor(display_frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(img)
            
            # Resize the image to fit the canvas size (accounting for ad space)
            img = img.resize((self.canvas_width, self.canvas_height), Image.LANCZOS)
            
            self.photo = ImageTk.PhotoImage(image=img)
            
            # Update canvas
            self.canvas.create_image(0, 0, image=self.photo, anchor=tk.NW)
            
        # Schedule the next update
        self.root.after(10, self.update_frame)
    
    def on_closing(self):
        self.cap.release()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = HandGestureDrawingApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()