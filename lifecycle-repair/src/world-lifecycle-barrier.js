var SD_worldLifecycleDiagnostics = {
	phase: "NO_WORLD",
	blockedCalls: 0,
	lastGate: "",
	joiningSince: 0,
	lastWarning: 0
};

function SD_worldLifecycleReady(a, b) {
	var c = Date.now();
	var d = b || "unknown";

	if(a === null || a === undefined || a.O === null || a.O === undefined) {
		SD_worldLifecycleDiagnostics.phase = "NO_WORLD";
		SD_worldLifecycleDiagnostics.lastGate = d;
		SD_worldLifecycleDiagnostics.joiningSince = 0;
		return 0;
	}

	if(a.t !== null && a.t !== undefined && (a.hl === null || a.hl === undefined)) {
		a.hl = a.t;
	}

	if(a.t !== null && a.t !== undefined && a.hl !== null && a.hl !== undefined) {
		if(SD_worldLifecycleDiagnostics.phase === "JOINING" &&
				typeof console !== "undefined" && typeof console.info === "function") {
			console.info("[SelahMC lifecycle] world is ready", {
				blockedCalls: SD_worldLifecycleDiagnostics.blockedCalls,
				gate: d,
				waitedMs: c - SD_worldLifecycleDiagnostics.joiningSince
			});
		}
		SD_worldLifecycleDiagnostics.phase = "READY";
		SD_worldLifecycleDiagnostics.lastGate = d;
		SD_worldLifecycleDiagnostics.joiningSince = 0;
		return 1;
	}

	if(SD_worldLifecycleDiagnostics.phase !== "JOINING") {
		SD_worldLifecycleDiagnostics.phase = "JOINING";
		SD_worldLifecycleDiagnostics.joiningSince = c;
		SD_worldLifecycleDiagnostics.lastWarning = 0;
	}

	SD_worldLifecycleDiagnostics.blockedCalls = SD_worldLifecycleDiagnostics.blockedCalls + 1;
	SD_worldLifecycleDiagnostics.lastGate = d;

	if(SD_worldLifecycleDiagnostics.lastWarning === 0 ||
			c - SD_worldLifecycleDiagnostics.lastWarning >= 5000) {
		SD_worldLifecycleDiagnostics.lastWarning = c;
		if(typeof console !== "undefined" && typeof console.warn === "function") {
			console.warn("[SelahMC lifecycle] holding unsafe world work", {
				cameraReady: a.hl !== null && a.hl !== undefined,
				gate: d,
				playerReady: a.t !== null && a.t !== undefined,
				worldReady: true
			});
		}
	}

	return 0;
}

if(typeof window !== "undefined") {
	try {
		Object.defineProperty(window, "SelahWorldLifecycle", {
			configurable: false,
			enumerable: true,
			value: SD_worldLifecycleDiagnostics,
			writable: false
		});
	} catch(SD_worldLifecycleExposeError) {
		window.SelahWorldLifecycle = SD_worldLifecycleDiagnostics;
	}
}
