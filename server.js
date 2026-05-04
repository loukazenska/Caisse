const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const ADMIN_PASSWORD = "Louka45";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const db = new sqlite3.Database("./db.sqlite");

// Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    image TEXT,
    stock INTEGER DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL,
    payment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// API produits
app.get("/products", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    res.json(rows);
  });
});

app.post("/products", (req, res) => {
  const password = req.headers["x-admin-password"];

  if (password !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  const { name, price, image } = req.body;

  db.run(
    "INSERT INTO products (name, price, image) VALUES (?, ?, ?)",
    [name, price, image],
    () => res.sendStatus(200)
  );
});

// API ventes
app.post("/sales", (req, res) => {
  const { total, payment, items } = req.body;

  db.serialize(() => {

    // enregistrer la vente
    db.run(
      "INSERT INTO sales (total, payment) VALUES (?, ?)",
      [total, payment]
    );

    // mettre à jour les stocks
    items.forEach(item => {
      db.get("SELECT stock, out_of_stock FROM products WHERE id = ?", [item.id], (err, row) => {

        if (!row) return;

        // si rupture forcée → on touche pas
        if (row.out_of_stock === 1) return;

        const newStock = row.stock - item.qty;

        db.run(
          "UPDATE products SET stock = ?, out_of_stock = ? WHERE id = ?",
          [
            newStock,
            newStock <= 0 ? 1 : 0,
            item.id
          ]
        );

      });
    });

  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

app.delete("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];

  if (password !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  db.run("DELETE FROM products WHERE id = ?", [req.params.id], () => {
    res.sendStatus(200);
  });
});

app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];

  if (password !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  const { name, price, stock, out_of_stock } = req.body;

  db.run(
    `UPDATE products 
     SET name=?, price=?, stock=?, out_of_stock=? 
     WHERE id=?`,
    [name, price, stock, out_of_stock ? 1 : 0, req.params.id],
    () => res.sendStatus(200)
  );
});

app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];

  if (password !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  const { name, price, stock, out_of_stock } = req.body;

  db.run(
    `UPDATE products 
     SET name=?, price=?, stock=?, out_of_stock=? 
     WHERE id=?`,
    [name, price, stock, out_of_stock ? 1 : 0, req.params.id],
    (err) => {
      if (err) {
        console.error(err);
        return res.sendStatus(500);
      }
      res.sendStatus(200);
    }
  );
});

