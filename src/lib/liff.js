// LINE LIFF：於 LINE 內開啟時，用 shareTargetPicker 將圖文卡片傳到好友或群組。
let liff = null

export async function initLiff(liffId) {
  if (!liffId) return null
  try {
    liff = (await import('@line/liff')).default
    await liff.init({ liffId })
    return liff
  } catch (e) {
    console.warn('LIFF 初始化失敗', e)
    liff = null
    return null
  }
}

export const canPickTarget = () => Boolean(liff?.isInClient?.() && liff.isApiAvailable('shareTargetPicker'))

/** 回傳 true 表示已送出，false 表示使用者取消。 */
export async function shareFlex(message) {
  const res = await liff.shareTargetPicker([message], { isMultiple: true })
  return Boolean(res)
}

/** 在 LINE 內開啟時取得使用者 ID（用於派工時個人推播）；不在 LINE 內或失敗回傳 null。 */
export async function lineUserId() {
  try {
    if (!liff?.isInClient?.() || !liff.isLoggedIn()) return null
    return (await liff.getProfile()).userId
  } catch {
    return null
  }
}
