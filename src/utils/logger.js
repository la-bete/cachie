const pino = require("pino");

// Pretty output is a development convenience. pino-pretty is a devDependency,
// so use it only outside production and only when it is actually installed;
// otherwise log plain JSON.
function prettyAvailable() {
	if (process.env.NODE_ENV === "production") return false;
	try {
		require.resolve("pino-pretty");
		return true;
	} catch {
		return false;
	}
}

const logger = pino({
	...(prettyAvailable() && {
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				levelFirst: true,
				translateTime: true,
			},
		},
	}),
	level: process.env.LOG_LEVEL || "info",
});

module.exports = logger;
