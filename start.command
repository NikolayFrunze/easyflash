#!/bin/bash
# Double-click to start EasyFlash. Keep this window open while you study.
cd "$(dirname "$0")"
(sleep 1 && open "http://127.0.0.1:8765") &
exec python3 server.py
