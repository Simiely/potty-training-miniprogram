// ============================================================
// 照顾者（记录人）档案：本机存储 + 头像上传
// 设计：每位家庭成员在自己的手机上维护「本机照顾者列表」，记录时把
// 当前记录人的 {nickname, avatarUrl} 快照写进每条记录。这样无论谁在
// 哪台设备看，都能看到「是谁记录的」。
// 头像：云模式下通过 wx.cloud.uploadFile 上传到云存储，拿到跨设备可见的
// fileID（cloud://...）；本地模式则保留 chooseAvatar 返回的临时路径（仅本机可见）。
// ============================================================
const { STORAGE_KEYS, CLOUD } = require('../config');
const { initCloud } = require('./cloud');

function genId() {
  return `u_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function getProfiles() {
  return wx.getStorageSync(STORAGE_KEYS.PROFILES) || [];
}
function saveProfiles(list) {
  wx.setStorageSync(STORAGE_KEYS.PROFILES, list);
}
function getCurrentUserId() {
  return wx.getStorageSync(STORAGE_KEYS.CURRENT_USER) || '';
}
function setCurrentUserId(id) {
  wx.setStorageSync(STORAGE_KEYS.CURRENT_USER, id);
}
function getCurrentProfile() {
  const id = getCurrentUserId();
  return getProfiles().find((p) => p.id === id) || null;
}

// 保障云初始化已执行：app.js onLaunch 可能因 wx.cloud 尚未注入而跳过，
// 本函数在首次真正需要云能力时补刀。initCloud 幂等，不会重复触发 SDK 初始化。
function ensureCloudInit() {
  if (!CLOUD.ENV) return false;
  if (typeof wx === 'undefined' || !wx.cloud) return false;
  return initCloud(CLOUD.ENV);
}

// 上传头像：云模式上传到云存储返回 fileID（跨设备可见）；
// 本地模式把 chooseAvatar 的临时文件持久化到本地用户目录，避免重启后失效。
function uploadAvatar(tempPath) {
  return new Promise((resolve) => {
    if (!tempPath) return resolve('');
    const useCloud = ensureCloudInit() && CLOUD.ENV;
    if (useCloud) {
      const ext = (tempPath.match(/\.(\w+)(?:\?.*)?$/) || [, 'png'])[1];
      const cloudPath = `avatars/${genId()}.${ext}`;
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: (r) => resolve(r.fileID),
        fail: () => resolve(tempPath), // 上传失败不阻断流程，降级为本地路径
      });
      return;
    }
    // 本地模式：saveFile 会得到持久化的 store:// 路径
    try {
      wx.getFileSystemManager().saveFile({
        tempFilePath: tempPath,
        success: (r) => resolve(r.savedFilePath),
        fail: () => resolve(tempPath),
      });
    } catch (e) {
      resolve(tempPath);
    }
  });
}

// 新增或更新照顾者。editId 为空表示新增。
async function saveProfile({ nickname, avatarTempPath, editId }) {
  const fileID = await uploadAvatar(avatarTempPath);
  const list = getProfiles();
  if (editId) {
    const p = list.find((x) => x.id === editId);
    if (p) {
      // 仅当提供了新头像或昵称时才覆盖，避免清空已有头像
      p.nickname = nickname || p.nickname || '我';
      if (fileID) p.avatarUrl = fileID;
    }
    saveProfiles(list);
    return p;
  }
  const profile = {
    id: genId(),
    nickname: nickname || '我',
    avatarUrl: fileID,
  };
  list.push(profile);
  saveProfiles(list);
  // 第一个照顾者自动设为当前记录人
  if (!getCurrentUserId()) setCurrentUserId(profile.id);
  return profile;
}

function deleteProfile(id) {
  const list = getProfiles().filter((p) => p.id !== id);
  saveProfiles(list);
  if (getCurrentUserId() === id) {
    setCurrentUserId(list.length ? list[0].id : '');
  }
}

// 当前记录人的快照，用于写进记录 / 顶部展示
function getCurrentRecorder() {
  const p = getCurrentProfile();
  return p ? { nickname: p.nickname, avatarUrl: p.avatarUrl } : null;
}

module.exports = {
  getProfiles,
  getCurrentUserId,
  setCurrentUserId,
  getCurrentProfile,
  saveProfile,
  deleteProfile,
  getCurrentRecorder,
};
