export type ApprovalType = 'video' | 'file' | 'present' | 'screen';

export function getMeetingApprovalToken(meetingId: string) {
  try { return localStorage.getItem(`melanam:meeting-approval:${meetingId}`) || ''; }
  catch { return ''; }
}

export async function requestMeetingApproval(meetingId: string, type: ApprovalType, payload: Record<string, unknown>, requesterName: string) {
  const token = getMeetingApprovalToken(meetingId);
  if (!token) throw new Error('Meeting approval is unavailable. Rejoin the room and try again.');
  const response = await fetch('/api/meeting-approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ meetingId, type, requesterName, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not request host approval.');
  return String(result.requestId);
}

export async function waitForMeetingApproval(meetingId: string, requestId: string) {
  const token = getMeetingApprovalToken(meetingId);
  for (let attempt = 0; attempt < 450; attempt++) {
    const response = await fetch(`/api/meeting-approvals?meetingId=${encodeURIComponent(meetingId)}&requestId=${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Approval status is unavailable.');
    if (result.status === 'approved') return requestId;
    if (result.status === 'rejected') throw new Error('The host declined this request.');
    if (result.status === 'used') throw new Error('This approval was already used.');
    if (new Date(result.expiresAt).getTime() <= Date.now()) throw new Error('The request expired. Please try again.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('The host did not respond before the request expired.');
}

export async function consumeClientApproval(meetingId: string, requestId: string, type: 'screen' | 'present', payload: Record<string, unknown> = {}) {
  const response = await fetch('/api/meeting-approvals', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getMeetingApprovalToken(meetingId)}` },
    body: JSON.stringify({ meetingId, action: 'consume', requestId, type, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Host approval is required.');
}
