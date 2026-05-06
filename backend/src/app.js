const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const companiesRoutes = require("./routes/companiesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const dealsRoutes = require("./routes/dealsRoutes");
const docsRoutes = require("./routes/docsRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const usersRoutes = require("./routes/usersRoutes");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.use(authRoutes);
app.use(usersRoutes);
app.use(companiesRoutes);
app.use(dealsRoutes);
app.use(dashboardRoutes);
app.use(ownerRoutes);
app.use(docsRoutes);

const start = async () => {
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
};

start().catch((error) => {
  console.error("Не удалось запустить сервер:", error);
  process.exit(1);
});

