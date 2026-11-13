require("dotenv").config();
const cors = require("cors");
const path = require("path");
const express = require("express");
const OpenApiValidator = require("express-openapi-validator");
const { HttpError } = require("express-openapi-validator/dist/framework/types");

const router = require("./controllers");
const logger = require("./utils/logger");
const Response = require("./utils/response");
const traceIdFetchMiddleware = require("./utils/get_trace_id");

const app = express();

// Middlewares
app.use((_, res, next) => {
	res.setHeader("Content-Type", "application/json");
	next();
});
app.use(cors());
app.use(express.json());
app.use(traceIdFetchMiddleware);
app.use(
	"/spec",
	express.static(path.join(__dirname, "api.yml"), {
		// Override the JSON default set above; the spec is YAML.
		setHeaders: (res) => res.setHeader("Content-Type", "application/yaml; charset=utf-8"),
	}),
);

app.use(
	OpenApiValidator.middleware({
		validateRequests: true,
		validateResponses: true,
		apiSpec: path.join(__dirname, "api.yml"),
	}),
);

// Log incoming requests
app.use((req, _, next) => {
	logger.info(
		{
			url: req.url,
			body: req.body,
			query: req.query,
			method: req.method,
			headers: req.headers,
		},
		"Incoming request payload for trace-id: " + req.traceId,
	);
	next();
});

// Route handler
app.use(router);

// Fallback error handler
app.use((err, req, res, _) => {
	logger.error(err, "Error occurred for trace-id: " + req.traceId);
	if (err instanceof SyntaxError && "body" in err && err.status === 400)
		err = new Response("Invalid JSON payload passed", 400);
	if (err instanceof HttpError) err = new Response(err.message, 400);
	const resp = err instanceof Response ? err : new Response("Internal server error occurred", 500);
	res.status(resp.status).send(resp.toJSON());
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => logger.info(`Server listening on port ${PORT}`));

module.exports = app;
