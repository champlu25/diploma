const express = require("express");
const swaggerUi = require("swagger-ui-express");

const openApiSpec = require("../openapi");

const router = express.Router();

router.get("/api/openapi.json", (_req, res) => {
  res.status(200).json(openApiSpec);
});

router.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Leasing CRM API",
  }),
);

module.exports = router;
