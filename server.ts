import express from "express";
import path from "path";

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist/index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
