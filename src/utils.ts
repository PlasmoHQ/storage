export const isChromeBelow100 = () => {
  try {
    const ua = navigator.userAgent

    console.log(ua)

    let browserMatch =
      ua.match(
        /(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i
      ) || []

    if (browserMatch[1] === "Chrome") {
      const temp = ua.match(/\b(OPR|Edge)\/(\d+)/)
      if (!!temp) {
        return parseInt(temp[2]) < 100
      }
    }
  } catch {
    return false
  }

  return false
}
