Host notifier

This small tool runs on your host (not inside Docker) and shows native OS notifications (and sound) by polling the backend API.

Setup

1. On your host machine (not inside container), install dependencies:

```sh
cd tools/host-notifier
npm install
```

2. Run the notifier:

```sh
# default: polls http://localhost:4000 every 60 minutes
node notifier.js

# optional env vars
VITE_API_URL=http://192.168.1.100:4000 POLL_MINUTES=30 node notifier.js
```

Notes

- The notifier uses `node-notifier` for cross-platform native notifications.
- Make sure your backend is reachable from the host (port-forwarding or public URL).
- The notifier respects the water target: it will not notify if the target is already reached.
