#!/bin/bash

# Start backend
cd backend && python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both"

# Kill both on exit
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
