import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, arrayUnion, serverTimestamp, onSnapshot, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { app } from './firebase';

const db = getFirestore(app);

// グループ作成
export async function createGroup({ name, ownerId, ownerName }: { name: string, ownerId: string, ownerName: string }) {
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, {
    name,
    owner: ownerId,
    members: [{ id: ownerId, name: ownerName }],
    createdAt: serverTimestamp(),
  });
  return groupRef.id;
}

// グループにメンバー追加
export async function joinGroup(groupId: string, user: { id: string, name: string }) {
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, {
    members: arrayUnion(user)
  });
}

// グループ取得
export async function getGroup(groupId: string) {
  const groupRef = doc(db, 'groups', groupId);
  const snap = await getDoc(groupRef);
  return snap.exists() ? { id: groupId, ...snap.data() } : null;
}

// イベント作成
export async function createEvent(groupId: string, name: string, participants: { id: string, name: string }[]) {
  const eventsCol = collection(db, 'groups', groupId, 'events');
  const eventRef = await addDoc(eventsCol, {
    name,
    participants,
    createdAt: serverTimestamp(),
    payments: {},
    result: null,
  });
  return eventRef.id;
}

// イベント取得
export async function getEvent(groupId: string, eventId: string) {
  const eventRef = doc(db, 'groups', groupId, 'events', eventId);
  const snap = await getDoc(eventRef);
  return snap.exists() ? { id: eventId, ...snap.data() } : null;
}

// イベント一覧取得
export async function getEvents(groupId: string) {
  const eventsCol = collection(db, 'groups', groupId, 'events');
  const q = query(eventsCol);
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// 割り勘結果保存
export async function saveEventResult(groupId: string, eventId: string, result: any) {
  const eventRef = doc(db, 'groups', groupId, 'events', eventId);
  await updateDoc(eventRef, { result });
}

// グループ削除（サブコレクションも再帰的に削除）
export async function deleteGroupWithEvents(groupId: string) {
  const db = getFirestore();
  const groupRef = doc(db, 'groups', groupId);
  // サブコレクション(events)を全削除
  const eventsCol = collection(db, 'groups', groupId, 'events');
  const eventsSnap = await getDocs(eventsCol);
  const batch = writeBatch(db);
  eventsSnap.forEach(ev => batch.delete(ev.ref));
  batch.delete(groupRef);
  await batch.commit();
}

// イベント削除
export async function deleteEventDoc(groupId: string, eventId: string) {
  const db = getFirestore();
  const eventRef = doc(db, 'groups', groupId, 'events', eventId);
  await deleteDoc(eventRef);
}

export { db }; 