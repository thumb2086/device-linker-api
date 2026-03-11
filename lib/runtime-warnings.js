let _installed = false;

function installRuntimeWarningHandler() {
    if (_installed) return;
    _installed = true;

    const traceDeprecations = String(process.env.TRACE_DEPRECATIONS || "").trim() === "1";

    process.on("warning", (warning) => {
        if (!warning || typeof warning !== "object") return;
        if (warning.code === "DEP0169") {
            if (traceDeprecations) {
                console.warn(warning.stack || warning);
            }
            return;
        }
        console.warn(warning.stack || warning);
    });
}

installRuntimeWarningHandler();

