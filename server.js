const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const db = {};

// TRACK EMAIL OPEN (pixel hit)
app.get("/track", (req, res) => {
    const id = req.query.id;

    if (!db[id]) {
        db[id] = {
            opened: false,
            count: 0,
            firstOpened: null,
            lastOpened: null
        };
    }

    db[id].opened = true;
    db[id].count += 1;
    db[id].lastOpened = Date.now();

    if (!db[id].firstOpened) {
        db[id].firstOpened = Date.now();
    }

    console.log("Opened:", id);

    // 1x1 pixel response
    const pixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        "base64"
    );

    res.setHeader("Content-Type", "image/png");
    res.send(pixel);
});

// STATUS CHECK (for extension UI)
app.get("/status", (req, res) => {
    const id = req.query.id;
    res.json(db[id] || { opened: false });
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});