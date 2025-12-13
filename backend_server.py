
import asyncio
import json
import time
import threading
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, HTMLResponse
import uvicorn
import cv2
import numpy as np
import psutil

app = FastAPI()


CONFIG_PATH = "config/body_detection_config.json"
DEFAULT_CAMERA_ID = 0


frame_lock = threading.Lock()
latest_frame = None
latest_stats = {
    "fps": 0.0,
    "gesture_count": 0,
    "detection_count": 0,
    "confidence": 0.0
}


class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, msg: dict):
        data = json.dumps(msg)
        for ws in list(self.active):
            try:
                await ws.send_text(data)
            except Exception:
                self.disconnect(ws)

manager = ConnectionManager()

BodyDetectionSystem = None
BodyDetectionConfig = None
try:
    from modules.body_detection.body_detection import BodyDetectionSystem, BodyDetectionConfig 
except Exception:
    BodyDetectionSystem = None
    BodyDetectionConfig = None

_stop_event = threading.Event()

def detection_thread_main():
    global latest_frame, latest_stats

    if BodyDetectionSystem and BodyDetectionConfig:
        try:
            cfg = BodyDetectionConfig.from_file(CONFIG_PATH)
        except Exception:
            cfg = None

        try:
            detector = BodyDetectionSystem(cfg) if cfg else BodyDetectionSystem()
        except Exception:
            detector = None

        if detector:
            def on_command(cmd):
                payload = {
                    "type": "gesture_command",
                    "timestamp": time.time(),
                    "command": getattr(cmd, "action", str(cmd)),
                    "parameters": getattr(cmd, "parameters", {})
                }
                asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop=asyncio.get_event_loop())

            try:
                detector.register_command_callback(on_command)
            except Exception:
                
                pass

            detector.start()
            while not _stop_event.is_set():
                try:
                    frame = None
                    if hasattr(detector, "current_frame"):
                        frame = detector.current_frame
                    elif hasattr(detector, "get_latest_frame"):
                        frame = detector.get_latest_frame()
                    if frame is not None:
                        with frame_lock:
                            latest_frame = frame.copy() if isinstance(frame, np.ndarray) else frame
                    s = {}
                    s["fps"] = getattr(detector, "fps", latest_stats["fps"])
                    s["gesture_count"] = getattr(detector, "gesture_count", latest_stats["gesture_count"])
                    s["detection_count"] = getattr(detector, "detection_count", latest_stats["detection_count"])
                    s["confidence"] = getattr(detector, "last_confidence", latest_stats["confidence"])
                    latest_stats.update(s)
                except Exception:
                    pass
                time.sleep(0.02)
            detector.stop()
            return

    cam_id = DEFAULT_CAMERA_ID
    try:
        import json, os
        if CONFIG_PATH and os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                cam_id = cfg.get("camera_id", cam_id)
    except Exception:
        pass

    def open_camera_try(cam_id):
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, 0]
        cap = None
        for api in backends:
            try:
                cap = cv2.VideoCapture(int(cam_id), api)
            except Exception:
                cap = None
            if cap is None:
                continue
            if cap.isOpened():
                try:
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                except Exception:
                    pass
                print(f"[Camera] Opened camera {cam_id} using api {api}")
                return cap
            else:
                try:
                    cap.release()
                except Exception:
                    pass
        print(f"[Camera] Failed to open camera {cam_id} with tried backends.")
        return None

    cap = open_camera_try(cam_id)
    if cap is None:
        print("[Camera] Warning: no camera opened â€” streaming blank frames")
        cap = None

    last = time.time()
    frames = 0
    gesture_counter = 0
    detection_counter = 0

    while not _stop_event.is_set():
        if cap is not None:
            ret, frame = cap.read()
        else:
            ret, frame = False, None

        if not ret or frame is None:
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            with frame_lock:
                latest_frame = blank
            time.sleep(0.05)
            continue

        frames += 1
        if time.time() - last >= 1.0:
            latest_stats["fps"] = frames / (time.time() - last)
            frames = 0
            last = time.time()

        if np.random.rand() > 0.995:
            gesture_counter += 1
            payload = {
                "type": "gesture_command",
                "timestamp": time.time(),
                "command": "simulated_gesture",
                "parameters": {}
            }
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(payload),
                loop=asyncio.get_event_loop()
            )

        detection_counter += 0  

        with frame_lock:
            latest_frame = frame.copy()
            latest_stats.update({
                "gesture_count": gesture_counter,
                "detection_count": detection_counter,
                "confidence": 0.9
            })

    if cap is not None:
        cap.release()


threading.Thread(target=detection_thread_main, daemon=True).start()

def mjpeg_generator():
    global latest_frame
    while True:
        if _stop_event.is_set():
            break
        with frame_lock:
            frame = latest_frame
        if frame is None:
            img = np.zeros((480, 640, 3), dtype=np.uint8)
            ret, jpeg = cv2.imencode('.jpg', img)
        else:
            if isinstance(frame, np.ndarray):
                ret, jpeg = cv2.imencode('.jpg', frame)
            else:
                try:
                    jpeg = frame
                except Exception:
                    img = np.zeros((480, 640, 3), dtype=np.uint8)
                    ret, jpeg = cv2.imencode('.jpg', img)

        if jpeg is None:
            time.sleep(0.02)
            continue

        b = jpeg.tobytes() if hasattr(jpeg, "tobytes") else bytes(jpeg)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + b + b'\r\n')
        time.sleep(0.03)

@app.get("/")
def index():
    text = """
    <html><body>
    <h3>NETRAX AI backend</h3>
    <ul>
      <li><a href="/video_feed">/video_feed</a> - MJPEG stream for browser</li>
      <li>WebSocket endpoint: ws://{host}:8000/ws</li>
    </ul>
    </body></html>
    """
    return HTMLResponse(content=text)

@app.get("/video_feed")
def video_feed():
    return StreamingResponse(mjpeg_generator(), media_type='multipart/x-mixed-replace; boundary=frame')

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            payload = {"type": "stats", "timestamp": time.time(), "stats": latest_stats.copy(), "cpu": psutil.cpu_percent()}
            await ws.send_text(json.dumps(payload))
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)

if __name__ == "__main__":
    uvicorn.run("backend_server:app", host="0.0.0.0", port=8000, reload=False)