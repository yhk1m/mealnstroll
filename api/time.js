// © 2026 김용현
// Returns the server clock so every walker computes positions on the same timeline.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ now: Date.now() });
}
