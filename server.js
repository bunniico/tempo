const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');

app.use(express.static(publicDir));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  return next();
});

app.listen(PORT, () => {
  console.log(`Pomodoro server running at http://localhost:${PORT}`);
});
