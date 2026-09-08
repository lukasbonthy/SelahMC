var SD_worldLifecycleDiagnostics = {
	phase: "NO_WORLD",
	generation: 0,
	committedGeneration: 0,
	blockedCalls: 0,
	blockedBy: "world",
	lastGate: "",
	joiningSince: 0,
	lastWarning: 0
};

var SD_worldLifecycleStateKey = "__selahWorldLifecycleState";

function SD_deferredCapabilityFallback() {
	try {
		if(typeof document === "undefined" || document === null ||
				typeof document.createElement !== "function") return false;
		var canvas = document.createElement("canvas");
		if(canvas === null || typeof canvas.getContext !== "function") return false;
		var gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false
		});
		if(gl === null || gl === undefined ||
				typeof gl.getExtension !== "function") return false;

		var colorBufferFloat = gl.getExtension("EXT_color_buffer_float");
		var colorBufferHalfFloat = gl.getExtension("EXT_color_buffer_half_float");
		if(colorBufferFloat === null && colorBufferHalfFloat === null) return false;

		var texture = null;
		var framebuffer = null;
		try {
			texture = gl.createTexture();
			framebuffer = gl.createFramebuffer();
			if(texture === null || framebuffer === null) return false;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			if(typeof gl.texParameteri === "function") {
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			}
			var formats = [];
			if(colorBufferFloat !== null) formats.push([gl.RGBA32F, gl.FLOAT]);
			formats.push([gl.RGBA16F, gl.HALF_FLOAT]);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			for(var i=0;i<formats.length;i++) {
				try {
					gl.texImage2D(gl.TEXTURE_2D, 0, formats[i][0], 1, 1, 0,
							gl.RGBA, formats[i][1], null);
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
							gl.TEXTURE_2D, texture, 0);
					if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
						return true;
					}
				} catch(SD_deferredCapabilityFormatError) {
				}
			}
			return false;
		} finally {
			try {
				if(typeof gl.bindFramebuffer === "function") {
					gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				}
			} catch(SD_deferredCapabilityUnbindError) {
			}
			try {
				if(typeof gl.deleteFramebuffer === "function" && framebuffer !== null) {
					gl.deleteFramebuffer(framebuffer);
				}
			} catch(SD_deferredCapabilityFramebufferError) {
			}
			try {
				if(typeof gl.deleteTexture === "function" && texture !== null) {
					gl.deleteTexture(texture);
				}
			} catch(SD_deferredCapabilityTextureError) {
			}
		}
	} catch(SD_deferredCapabilityError) {
		return false;
	}
}



function SD_worldLifecycleGetState(a, b) {
	if(a === null || a === undefined) return null;
	var c = a[SD_worldLifecycleStateKey];
	if((c === null || c === undefined) && b) {
		c = {
			phase: "NO_WORLD",
			generation: 0,
			committedGeneration: 0,
			world: null
		};
		try {
			Object.defineProperty(a, SD_worldLifecycleStateKey, {
				configurable: false,
				enumerable: false,
				value: c,
				writable: false
			});
		} catch(SD_worldLifecycleStateError) {
			a[SD_worldLifecycleStateKey] = c;
		}
	}
	return c || null;
}

function SD_worldLifecycleSyncDiagnostics(a, b, c) {
	SD_worldLifecycleDiagnostics.phase = b.phase;
	SD_worldLifecycleDiagnostics.generation = b.generation;
	SD_worldLifecycleDiagnostics.committedGeneration = b.committedGeneration;
	SD_worldLifecycleDiagnostics.blockedBy = c || "";
	if(a !== null && a !== undefined) {
		SD_worldLifecycleDiagnostics.worldReady = a.O !== null && a.O !== undefined;
		SD_worldLifecycleDiagnostics.playerReady = a.t !== null && a.t !== undefined;
		SD_worldLifecycleDiagnostics.cameraReady = a.hl !== null && a.hl !== undefined;
	}
}

function SD_worldLifecycleBegin(a, b) {
	if(b === null || b === undefined) return SD_worldLifecycleReset(a);
	var c = SD_worldLifecycleGetState(a, 1);
	if(c === null) return 0;
	c.generation = c.generation + 1;
	c.committedGeneration = 0;
	c.phase = "JOINING";
	c.world = b;
	SD_worldLifecycleDiagnostics.joiningSince = Date.now();
	SD_worldLifecycleDiagnostics.lastWarning = 0;
	SD_worldLifecycleDiagnostics.lastGate = "loadWorld.begin";
	SD_worldLifecycleSyncDiagnostics(a, c, "transaction");
	return c.generation;
}

function SD_worldLifecycleOwns(a, b) {
	var c = SD_worldLifecycleGetState(a, 0);
	return c !== null && c.generation === b;
}

function SD_worldLifecycleCommit(a, generation) {
	var b = SD_worldLifecycleGetState(a, 0);
	if(b === null || b.phase !== "JOINING" || b.world === null ||
			b.world !== a.O || (generation !== undefined && generation !== b.generation)) {
		if(b !== null) SD_worldLifecycleSyncDiagnostics(a, b, "transaction");
		return 0;
	}
	if(a.t === null || a.t === undefined) {
		SD_worldLifecycleSyncDiagnostics(a, b, "player");
		return 0;
	}
	if(a.hl === null || a.hl === undefined) {
		SD_worldLifecycleSyncDiagnostics(a, b, "camera");
		return 0;
	}
	b.committedGeneration = b.generation;
	b.phase = "READY";
	SD_worldLifecycleSyncDiagnostics(a, b, "");
	if(typeof console !== "undefined" && typeof console.info === "function") {
		console.info("[SelahMC lifecycle] world transaction committed", {
			blockedCalls: SD_worldLifecycleDiagnostics.blockedCalls,
			generation: b.generation,
			waitedMs: Date.now() - SD_worldLifecycleDiagnostics.joiningSince
		});
	}
	SD_worldLifecycleDiagnostics.joiningSince = 0;
	return 1;
}

function SD_worldLifecycleReset(a) {
	var b = SD_worldLifecycleGetState(a, 1);
	if(b === null) return 0;
	b.generation = b.generation + 1;
	b.committedGeneration = 0;
	b.phase = "NO_WORLD";
	b.world = null;
	SD_worldLifecycleDiagnostics.joiningSince = 0;
	SD_worldLifecycleDiagnostics.lastWarning = 0;
	SD_worldLifecycleDiagnostics.lastGate = "loadWorld.reset";
	SD_worldLifecycleSyncDiagnostics(a, b, "world");
	return b.generation;
}

function SD_worldLifecycleReady(a, b) {
	var c = Date.now();
	var d = b || "unknown";
	var e = SD_worldLifecycleGetState(a, 0);
	var f = "";

	if(a === null || a === undefined ||
			((a.O === null || a.O === undefined) && (e === null || e.phase !== "JOINING")) ||
			(e !== null && e.phase === "NO_WORLD")) {
		SD_worldLifecycleDiagnostics.phase = "NO_WORLD";
		SD_worldLifecycleDiagnostics.committedGeneration = 0;
		SD_worldLifecycleDiagnostics.blockedBy = "world";
		SD_worldLifecycleDiagnostics.lastGate = d;
		SD_worldLifecycleDiagnostics.joiningSince = 0;
		return 0;
	}

	if(a.O === null || a.O === undefined) {
		f = "world";
	} else if(a.t === null || a.t === undefined) {
		f = "player";
	} else if(a.hl === null || a.hl === undefined) {
		f = "camera";
	} else if(e === null || e.phase !== "READY" ||
			e.committedGeneration !== e.generation || e.world !== a.O) {
		f = "transaction";
	}

	if(f === "") {
		SD_worldLifecycleSyncDiagnostics(a, e, "");
		SD_worldLifecycleDiagnostics.lastGate = d;
		return 1;
	}

	if(SD_worldLifecycleDiagnostics.phase !== "JOINING") {
		SD_worldLifecycleDiagnostics.joiningSince = c;
		SD_worldLifecycleDiagnostics.lastWarning = 0;
	}
	SD_worldLifecycleDiagnostics.phase = "JOINING";
	SD_worldLifecycleDiagnostics.blockedCalls = SD_worldLifecycleDiagnostics.blockedCalls + 1;
	SD_worldLifecycleDiagnostics.blockedBy = f;
	SD_worldLifecycleDiagnostics.lastGate = d;
	if(e !== null) SD_worldLifecycleSyncDiagnostics(a, e, f);
	// Readiness is an observation. Only begin/reset/commit change the transaction.
	SD_worldLifecycleDiagnostics.phase = "JOINING";

	if(SD_worldLifecycleDiagnostics.lastWarning === 0 ||
			c - SD_worldLifecycleDiagnostics.lastWarning >= 5000) {
		SD_worldLifecycleDiagnostics.lastWarning = c;
		if(typeof console !== "undefined" && typeof console.warn === "function") {
			console.warn("[SelahMC lifecycle] holding unsafe world work", {
				blockedBy: f,
				cameraReady: a.hl !== null && a.hl !== undefined,
				gate: d,
				generation: e === null ? 0 : e.generation,
				playerReady: a.t !== null && a.t !== undefined,
				worldReady: a.O !== null && a.O !== undefined
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
