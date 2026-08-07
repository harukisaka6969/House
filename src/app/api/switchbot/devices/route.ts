import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { switchBotAvailable, listDevices, getDeviceStatus } from "@/lib/switchbot";
import { getDeviceRooms } from "@/lib/switchbotRooms";

/** 登録済みSwitchBotデバイス（実機＋赤外線リモコン）一覧を、可能な範囲で現在状態・部屋割り当てつきで返す。
 * 状態取得に失敗する機種（学習リモコン等）はstatusがnullのまま返す。 */
export async function GET() {
  try {
    await requireOwnerSession();
    if (!switchBotAvailable()) throw new ApiError(400, "SwitchBot連携が未設定です。管理者に環境変数の設定を依頼してください。");

    const [{ deviceList, infraredRemoteList }, rooms] = await Promise.all([listDevices(), getDeviceRooms()]);

    const withStatus = await Promise.all(
      deviceList.map(async (d) => {
        const status = await getDeviceStatus(d.deviceId).catch(() => null);
        return { ...d, status, room: rooms[d.deviceId] ?? null };
      })
    );

    return NextResponse.json({
      devices: withStatus,
      // 赤外線リモコンはdeviceTypeを持たずremoteTypeのみのため、操作ロジック用に中立な型名を割り当てる
      // （Curtain/Lock/Vacuum等の実機専用コマンドを誤って学習リモコンに送らないようにするため）。
      infraredRemotes: infraredRemoteList.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: "Remote",
        remoteType: d.remoteType,
        status: null,
        room: rooms[d.deviceId] ?? null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
