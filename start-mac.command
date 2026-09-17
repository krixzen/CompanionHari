#!/bin/bash
# Double-click this file in Finder to start Study Planner.
# No terminal typing needed — this window is just here to show the app's logs.
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Setting things up for the first time — this can take a minute or two..."
  npm install
fi

echo ""
echo "Starting Study Planner..."
echo "Your browser will open automatically in a few seconds."
echo "Leave this window open while you use the app. To stop, close this window or press Ctrl+C."
echo ""

( sleep 4 && open "http://localhost:5173" ) &
npm run dev
