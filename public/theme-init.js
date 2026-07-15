(() => {
  try {
    const saved = localStorage.getItem("whachat-theme") || "system"
    const dark =
      saved === "dark" ||
      (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.add(dark ? "dark" : "light")
    document.documentElement.style.colorScheme = dark ? "dark" : "light"
  } catch {
    // ignore
  }
})()
