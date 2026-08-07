import "server-only";
import { switchBotAvailable, listDevices, listScenes, sendCommand, executeScene } from "./switchbot";
import { interpretSmartHomeCommand } from "./anthropic";

/** 自然文からSwitchBotのデバイス操作・シーン実行を行う共通処理（LINE・アプリ内テキスト入力の両方から使う）。
 * 戻り値は結果を伝える日本語メッセージ（成功・失敗どちらもテキストで返す。例外は投げない）。 */
export async function runSmartHomeTextCommand(text: string): Promise<string> {
  if (!switchBotAvailable()) return "SwitchBot連携が未設定です。「⑦ 設定」の管理者に確認してください。";

  try {
    const [{ deviceList, infraredRemoteList }, scenes] = await Promise.all([listDevices(), listScenes().catch(() => [])]);
    const devices = [
      ...deviceList.map((d) => ({ id: d.deviceId, name: d.deviceName, type: d.deviceType })),
      ...infraredRemoteList.map((d) => ({ id: d.deviceId, name: d.deviceName, type: d.remoteType ?? "Remote" })),
    ];
    if (devices.length === 0 && scenes.length === 0) return "操作できるデバイス・シーンが見つかりませんでした。";

    const result = await interpretSmartHomeCommand(
      text,
      devices,
      scenes.map((s) => ({ id: s.sceneId, name: s.sceneName }))
    );

    if (result.type === "device" && result.id && result.command) {
      const device = devices.find((d) => d.id === result.id);
      await sendCommand(result.id, result.command);
      return `🔌 ${device?.name ?? "デバイス"}を操作しました。`;
    }
    if (result.type === "scene" && result.id) {
      const scene = scenes.find((s) => s.sceneId === result.id);
      await executeScene(result.id);
      return `🎬 シーン「${scene?.sceneName ?? ""}」を実行しました。`;
    }
    return "操作したいデバイス・シーンが分かりませんでした。デバイス名やシーン名を含めて送ってください。";
  } catch (e) {
    console.error("runSmartHomeTextCommand failed", e);
    return "家電の操作に失敗しました。時間をおいてもう一度試すか、アプリの「㉑ 家電」から直接操作してください。";
  }
}
