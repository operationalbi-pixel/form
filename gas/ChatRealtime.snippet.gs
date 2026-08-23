/**
 * CHAT NEAR-REALTIME PATCH (Google Apps Script)
 *
 * PENTING: Apps Script TIDAK mendukung WebSocket server.
 * Ini adalah near-realtime: client poll 1.5 detik + fetch pesan baru saja.
 *
 * Cara pasang:
 * 1. Di apiActions_() tambahkan baris:
 *      chatRoomTick: getChatRoomTick,
 *    (setelah chatMessages)
 * 2. Ganti function getChatMessages(...) dengan versi di bawah.
 * 3. Tambahkan function getChatRoomTick di bawah ini.
 * 4. Deploy Web App: Manage deployments → Edit → New version → Deploy.
 */

function getChatRoomTick(token, roomId) {
  return safe_(function () {
    const employee = findEmployee_(requireSession_(token).nik); assertEmployeeActive_(employee);
    roomId = requireChatRoom_(employee, roomId); ensureChatDatabase_();
    const rows = chatSheetRows_('CHAT_MESSAGES').filter(function (row) {
      return String(row[1]) === roomId && !row[12];
    });
    let latest = 0;
    rows.forEach(function (row) {
      const seq = Number(row[2] || 0);
      if (seq > latest) latest = seq;
    });
    return { roomId: roomId, latestSequence: latest, serverTime: new Date().toISOString() };
  });
}

function getChatMessages(token, roomId, beforeSequence, afterSequence) {
  return safe_(function () {
    const employee = findEmployee_(requireSession_(token).nik); assertEmployeeActive_(employee);
    roomId = requireChatRoom_(employee, roomId); ensureChatDatabase_();
    const before = Number(beforeSequence || Number.MAX_SAFE_INTEGER);
    const after = Number(afterSequence || 0);
    let rows = chatSheetRows_('CHAT_MESSAGES').filter(function (row) {
      const seq = Number(row[2]);
      return String(row[1]) === roomId && seq < before && seq > after && !row[12];
    });
    if (!after) rows = rows.slice(-100);
    else rows = rows.slice(-200);
    const attachmentMap = {}, taskMap = {};
    chatSheetRows_('CHAT_ATTACHMENTS').forEach(function (row) {
      attachmentMap[String(row[0])] = { id: String(row[0]), name: String(row[4]), mimeType: String(row[5]), size: Number(row[6] || 0) };
    });
    chatSheetRows_('CHAT_TASKS').forEach(function (row) {
      taskMap[String(row[0])] = {
        id: String(row[0]),
        title: String(row[2]),
        description: String(row[3] || ''),
        dueAt: row[4] ? chatIso_(row[4]) : '',
        status: String(row[6])
      };
    });
    const messages = rows.map(function (row) {
      let attachmentIds = [];
      try { attachmentIds = JSON.parse(String(row[9] || '[]')); } catch (error) {}
      return {
        id: String(row[0]),
        roomId: roomId,
        sequence: Number(row[2]),
        senderNik: String(row[3]),
        senderName: String(row[4]),
        senderOutlet: String(row[5]),
        type: String(row[6]),
        body: String(row[7] || ''),
        replyToId: String(row[8] || ''),
        attachments: attachmentIds.map(function (id) { return attachmentMap[id]; }).filter(Boolean),
        task: row[10] ? taskMap[String(row[10])] || null : null,
        createdAt: chatIso_(row[11])
      };
    });
    let latestSequence = after;
    messages.forEach(function (m) {
      if (Number(m.sequence) > latestSequence) latestSequence = Number(m.sequence);
    });
    if (!after) {
      latestSequence = messages.length ? messages[messages.length - 1].sequence : 0;
    } else if (!messages.length) {
      latestSequence = after;
    }
    return {
      messages: messages,
      hasMore: !after && rows.length === 100,
      oldestSequence: messages.length ? messages[0].sequence : 0,
      latestSequence: latestSequence
    };
  });
}
