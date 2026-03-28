#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend
(cd "$ROOT/backend" && python3 -m uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

# Start frontend
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
