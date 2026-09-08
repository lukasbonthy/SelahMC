(function(global) {
	"use strict";

	// Native deferred and OptiFine hooks must not touch WebGL while the
	// resource manager is still rebuilding GPU objects. The loader opens this
	// gate only after Selah reports that its final loading hand-off is complete.
	global.__selahDeferredBootReady = false;

	var mounted = false;
	var finished = false;
	var shell = null;
	var fill = null;
	var status = null;
	var percent = null;
	var currentProgress = 4;

	var stages = [
		{ match: "configuration was successful", progress: 9, label: "Opening the gate" },
		{ match: "Creating WebGL context", progress: 16, label: "Lighting the canvas" },
		{ match: "Setting user:", progress: 23, label: "Preparing your profile" },
		{ match: "Downloading: selahmc-assets", progress: 31, label: "Gathering the world" },
		{ match: "Decompressing: selahmc-assets", progress: 43, label: "Unpacking creation" },
		{ match: "Reloading ResourceManager", progress: 65, label: "Planting the cherry grove" },
		{ match: "Created: 1024x1024 textures-atlas", progress: 80, label: "Painting every block" },
		{ match: "[Selah]: Finalizing", progress: 91, label: "Equipping your client" },
		{ match: "[Selah]: Finished loading", progress: 100, label: "Welcome home" }
	];

	function setStage(nextProgress, nextLabel) {
		var previousProgress = currentProgress;
		currentProgress = Math.max(currentProgress, Math.min(100, nextProgress));
		if(currentProgress > previousProgress && typeof global.__selahReportLoadStage === "function") {
			try {
				global.__selahReportLoadStage(currentProgress, nextLabel);
			}catch(ignore) {}
		}
		if(fill) {
			fill.style.width = currentProgress + "%";
		}
		if(status && nextLabel) {
			status.textContent = nextLabel;
		}
		if(percent) {
			percent.textContent = String(currentProgress).padStart(2, "0") + "%";
		}
	}

	function finish() {
		if(finished) {
			return;
		}
		finished = true;
		setStage(100, "Welcome home");
		markDeferredBootReady();
		// The compiled game keeps its legacy red bootstrap canvas visible for a
		// few seconds after Selah's own modules report ready. Keep our scenic
		// layer over that hand-off so players never see the upstream flash.
		global.setTimeout(function() {
			if(shell) {
				shell.classList.add("is-leaving");
			}
		}, 10500);
		global.setTimeout(function() {
			if(shell && shell.parentNode) {
				shell.parentNode.removeChild(shell);
			}
			shell = null;
		}, 11750);
	}

	function markDeferredBootReady() {
		if(global.__selahDeferredBootReady === true) {
			return;
		}
		global.__selahDeferredBootReady = true;
		try {
			if(global.SelahDeferredRenderer && typeof global.SelahDeferredRenderer.setBootReady === "function") {
				global.SelahDeferredRenderer.setBootReady(true);
			}
		}catch(ignore) {}
		try {
			if(global.SelahOptiFine && typeof global.SelahOptiFine.setDeferredReady === "function") {
				global.SelahOptiFine.setDeferredReady(true);
			}
		}catch(ignore) {}
	}

	function inspectLog(args) {
		var line = "";
		for(var i = 0; i < args.length; ++i) {
			try {
				line += (i ? " " : "") + String(args[i]);
			}catch(ignore) {}
		}
		if(line.indexOf("Loaded ") !== -1 && line.indexOf(" resources from EPKs") !== -1) {
			setStage(56, "The world is taking shape");
		}
		for(var j = 0; j < stages.length; ++j) {
			if(line.indexOf(stages[j].match) !== -1) {
				setStage(stages[j].progress, stages[j].label);
				if(stages[j].progress === 100) {
					finish();
				}
				break;
			}
		}
	}

	["log", "info", "warn", "error", "debug"].forEach(function(method) {
		var original = global.console && global.console[method];
		if(typeof original !== "function") {
			return;
		}
		global.console[method] = function() {
			inspectLog(arguments);
			return original.apply(global.console, arguments);
		};
	});

	function mount() {
		if(mounted || !global.document || !global.document.body) {
			return;
		}
		mounted = true;

		var style = global.document.createElement("style");
		style.id = "selah-loader-v7-8-styles";
		style.textContent = [
			"#selah-loader-v7-8{position:fixed;inset:0;z-index:2147483645;overflow:hidden;background:#120d13;color:#fff5e5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;opacity:1;transition:opacity .75s ease,visibility .75s ease;}",
			"#selah-loader-v7-8.is-leaving{opacity:0;visibility:hidden;pointer-events:none;}",
			".selah-loader-scene{position:absolute;inset:-1.75%;background-image:url('selah-loader-bg-v7.8.jpg');background-image:image-set(url('selah-loader-bg-v7.8.jpg') 1x,url('selah-loader-bg-v7.8-2x.jpg') 2x);background-size:cover;background-repeat:no-repeat;background-position:center 51%;image-rendering:auto;filter:saturate(1.02) contrast(1.035);will-change:transform;backface-visibility:hidden;animation:selah-scene-drift 22s ease-in-out infinite alternate;}",
			".selah-loader-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(16,10,15,.76) 0%,rgba(25,15,23,.49) 36%,rgba(24,14,22,.11) 67%,rgba(14,9,13,.34) 100%),linear-gradient(0deg,rgba(13,9,12,.76),transparent 40%),radial-gradient(circle at 77% 36%,rgba(209,158,90,.10),transparent 25%);}",
			".selah-loader-grain{position:absolute;inset:0;opacity:.025;mix-blend-mode:soft-light;background-image:repeating-linear-gradient(0deg,transparent 0 4px,rgba(255,255,255,.12) 5px);pointer-events:none;}",
			".selah-loader-vignette{position:absolute;inset:0;box-shadow:inset 0 0 140px 28px rgba(7,5,7,.42);pointer-events:none;}",
			".selah-loader-copy{position:absolute;left:clamp(28px,7vw,112px);top:50%;width:min(650px,76vw);transform:translateY(-58%);}",
			".selah-loader-kicker{display:flex;align-items:center;gap:11px;margin-bottom:20px;color:#e7c56f;font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;}",
			".selah-loader-kicker:before{content:'✦';color:#e5a8c1;font-size:14px;text-shadow:0 0 14px rgba(229,168,193,.7);}",
			".selah-loader-logo{display:block;width:min(470px,74vw);height:auto;image-rendering:pixelated;filter:drop-shadow(0 12px 22px rgba(0,0,0,.52)) drop-shadow(0 0 22px rgba(214,171,82,.16));}",
			".selah-loader-tagline{margin:15px 0 0;color:#eadce2;font-size:clamp(14px,1.4vw,18px);font-weight:500;letter-spacing:.035em;text-shadow:0 2px 12px #000;}",
			".selah-loader-tagline strong{color:#f6d582;font-weight:750;}",
			".selah-loader-verse{margin-top:28px;display:inline-flex;align-items:center;gap:14px;padding:12px 15px 12px 13px;border:1px solid rgba(229,190,101,.42);border-left:3px solid #dda2bc;border-radius:4px 12px 12px 4px;background:linear-gradient(90deg,rgba(43,25,39,.78),rgba(31,22,29,.48));box-shadow:0 16px 42px rgba(0,0,0,.23),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(8px);}",
			".selah-loader-verse-cross{position:relative;width:26px;height:31px;flex:0 0 26px;}",
			".selah-loader-verse-cross:before,.selah-loader-verse-cross:after{content:'';position:absolute;background:linear-gradient(#f5dd94,#b98937);box-shadow:0 0 12px rgba(225,183,86,.28);}",
			".selah-loader-verse-cross:before{width:6px;height:29px;left:10px;top:1px}.selah-loader-verse-cross:after{height:6px;width:24px;left:1px;top:9px}",
			".selah-loader-verse b{display:block;color:#fff5e7;font:700 13px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.045em}.selah-loader-verse span{display:block;margin-top:4px;color:#d8b9c7;font:750 9px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.2em}",
			".selah-loader-emblem{position:absolute;right:clamp(42px,12vw,190px);top:43%;width:190px;height:190px;transform:translateY(-50%);opacity:.9;}",
			".selah-loader-emblem-ring{position:absolute;inset:0;border:1px solid rgba(232,199,112,.35);border-radius:50%;box-shadow:0 0 60px rgba(212,149,178,.12),inset 0 0 46px rgba(225,184,89,.08);animation:selah-ring 8s linear infinite;}",
			".selah-loader-emblem-ring:before,.selah-loader-emblem-ring:after{content:'✦';position:absolute;color:#dda1ba;font-size:13px;text-shadow:0 0 10px #dda1ba}.selah-loader-emblem-ring:before{left:12px;top:29px}.selah-loader-emblem-ring:after{right:11px;bottom:31px}",
			".selah-loader-cross:before,.selah-loader-cross:after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#fff0b3,#ca9237 55%,#8e5f24);box-shadow:0 0 22px rgba(224,181,81,.28),0 8px 24px rgba(0,0,0,.36);}",
			".selah-loader-cross:before{width:18px;height:118px}.selah-loader-cross:after{width:82px;height:18px;top:40%}",
			".selah-loader-petals{position:absolute;inset:0;overflow:hidden;pointer-events:none}.selah-loader-petal{position:absolute;top:-9%;left:var(--x);width:8px;height:8px;background:#e4a6bf;border-radius:8px 2px 8px 2px;opacity:var(--o);filter:drop-shadow(0 0 5px rgba(226,151,183,.35));animation:selah-petal-fall var(--d) linear var(--delay) infinite;}",
			".selah-loader-footer{position:absolute;left:clamp(24px,4vw,64px);right:clamp(24px,4vw,64px);bottom:clamp(22px,5vh,54px);}",
			".selah-loader-status-row{display:flex;align-items:center;justify-content:space-between;margin:0 2px 10px;color:#eadddf;font-size:11px;font-weight:750;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 2px 8px #000}.selah-loader-percent{color:#f1d17e;font-variant-numeric:tabular-nums}",
			".selah-loader-track{position:relative;height:9px;border:1px solid rgba(238,206,128,.47);border-radius:3px;background:rgba(16,11,15,.72);padding:2px;box-shadow:0 9px 28px rgba(0,0,0,.3),inset 0 1px 5px rgba(0,0,0,.65);overflow:hidden;}",
			".selah-loader-fill{position:relative;width:4%;height:100%;border-radius:1px;background:linear-gradient(90deg,#8e4f6c,#d88eae 48%,#f0cb74);box-shadow:0 0 18px rgba(225,151,185,.42);transition:width .72s cubic-bezier(.22,.76,.25,1);overflow:hidden;}",
			".selah-loader-fill:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.54),transparent);transform:translateX(-100%);animation:selah-loader-shimmer 1.7s ease-in-out infinite;}",
			".selah-loader-footer-note{display:flex;justify-content:space-between;margin-top:9px;color:#ad98a3;font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase}.selah-loader-footer-note b{color:#cfa5b8;font-weight:800}",
			"@keyframes selah-scene-drift{from{transform:scale(1.005) translate3d(-.18%,0,0)}to{transform:scale(1.028) translate3d(.25%,-.18%,0)}}",
			"@keyframes selah-petal-fall{0%{transform:translate3d(0,-30px,0) rotate(0deg)}55%{transform:translate3d(42px,58vh,0) rotate(230deg)}100%{transform:translate3d(-24px,112vh,0) rotate(520deg)}}",
			"@keyframes selah-loader-shimmer{0%,30%{transform:translateX(-115%)}75%,100%{transform:translateX(115%)}}",
			"@keyframes selah-ring{to{transform:rotate(360deg)}}",
			"@media(max-width:820px){.selah-loader-copy{top:43%;transform:translateY(-50%)}.selah-loader-emblem{right:-42px;top:24%;width:138px;height:138px;opacity:.52}.selah-loader-cross:before{height:86px;width:14px}.selah-loader-cross:after{width:61px;height:14px}.selah-loader-verse{margin-top:22px}.selah-loader-footer-note span:last-child{display:none}}",
			"@media(max-width:520px){.selah-loader-copy{left:24px;right:24px;width:auto}.selah-loader-kicker{font-size:9px;letter-spacing:.18em}.selah-loader-tagline{max-width:300px}.selah-loader-emblem{display:none}.selah-loader-verse{padding:10px 12px}.selah-loader-verse b{font-size:11px}.selah-loader-footer{left:20px;right:20px}.selah-loader-footer-note{font-size:8px}}",
			"@media(prefers-reduced-motion:reduce){.selah-loader-scene,.selah-loader-emblem-ring,.selah-loader-petal,.selah-loader-fill:after{animation:none!important}}"
		].join("");
		global.document.head.appendChild(style);

		shell = global.document.createElement("section");
		shell.id = "selah-loader-v7-8";
		shell.setAttribute("role", "status");
		shell.setAttribute("aria-live", "polite");
		shell.innerHTML = [
			"<div class='selah-loader-scene'></div>",
			"<div class='selah-loader-shade'></div>",
			"<div class='selah-loader-grain'></div>",
			"<div class='selah-loader-vignette'></div>",
			"<div class='selah-loader-petals' aria-hidden='true'></div>",
			"<main class='selah-loader-copy'>",
			"<div class='selah-loader-kicker'>Christian Minecraft Crossplay</div>",
			"<img class='selah-loader-logo' src='selah-logo-v7.8.png' alt='SelahMC'>",
			"<p class='selah-loader-tagline'><strong>Pause.</strong> Build with purpose. Belong to something good.</p>",
			"<div class='selah-loader-verse'><div class='selah-loader-verse-cross' aria-hidden='true'></div><div><b>“Be still, and know.”</b><span>PSALM 46:10</span></div></div>",
			"</main>",
			"<div class='selah-loader-emblem' aria-hidden='true'><div class='selah-loader-emblem-ring'></div><div class='selah-loader-cross'></div></div>",
			"<footer class='selah-loader-footer'>",
			"<div class='selah-loader-status-row'><span class='selah-loader-status'>Preparing your journey</span><span class='selah-loader-percent'>04%</span></div>",
			"<div class='selah-loader-track'><div class='selah-loader-fill'></div></div>",
			"<div class='selah-loader-footer-note'><span><b>SelahMC</b> Community Client</span><span>Grace in every block</span></div>",
			"</footer>"
		].join("");
		// Keep the overlay outside the body because the compiled game briefly
		// translates its canvas container during the final display hand-off.
		global.document.documentElement.appendChild(shell);
		fill = shell.querySelector(".selah-loader-fill");
		status = shell.querySelector(".selah-loader-status");
		percent = shell.querySelector(".selah-loader-percent");

		var petalWrap = shell.querySelector(".selah-loader-petals");
		for(var i = 0; i < 18; ++i) {
			var petal = global.document.createElement("i");
			petal.className = "selah-loader-petal";
			petal.style.setProperty("--x", ((i * 37 + 11) % 101) + "%");
			petal.style.setProperty("--d", (8 + (i % 7) * 1.35) + "s");
			petal.style.setProperty("--delay", (-i * 1.17) + "s");
			petal.style.setProperty("--o", String(0.24 + (i % 5) * 0.1));
			petalWrap.appendChild(petal);
		}
		setStage(currentProgress, "Preparing your journey");
	}

	if(global.document.readyState === "loading") {
		global.document.addEventListener("DOMContentLoaded", mount, { once: true });
	}else {
		mount();
	}

	global.setTimeout(function() {
		if(!finished) {
			setStage(Math.max(currentProgress, 96), "Almost ready");
		}
	}, 120000);

	global.SelahLoader = {
		setStage: setStage,
		finish: finish
	};
})(window);
