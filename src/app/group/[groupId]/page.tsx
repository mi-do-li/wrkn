"use client";
import { useEffect, useState, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { collection, doc, onSnapshot, addDoc, serverTimestamp, query, orderBy, updateDoc, deleteDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import { ThemeContext } from "../../theme-context";
const THEMES = [
  { name: "Sweet", bg: "from-pink-200 via-blue-200 to-purple-200" },
  { name: "Sunset", bg: "from-yellow-200 via-pink-200 to-red-200" },
  { name: "Mint", bg: "from-green-200 via-teal-200 to-blue-200" },
];

// GlassCardをインラインで定義
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`backdrop-blur-2xl bg-white/30 dark:bg-white/10 border border-white/40 dark:border-white/20 shadow-2xl rounded-[2.5rem] p-10 ${className}`}
      style={{ boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)", border: "1px solid rgba(255,255,255,0.18)" }}
    >
      {children}
    </div>
  );
}

function AnimatedParticles({ themeIdx = 0 }: { themeIdx?: number }) {
  const colorSets = [
    ["#f472b6", "#60a5fa", "#a78bfa"],
    ["#fbbf24", "#f472b6", "#f87171"],
    ["#6ee7b7", "#38bdf8", "#818cf8"],
  ];
  const colors = colorSets[themeIdx % colorSets.length];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-60 blur-2xl animate-pulse`}
          style={{
            width: `${60 + Math.random() * 80}px`,
            height: `${60 + Math.random() * 80}px`,
            left: `${Math.random() * 90}%`,
            top: `${Math.random() * 90}%`,
            background: `linear-gradient(135deg, ${colors[i%3]} 0%, ${colors[(i+1)%3]} 100%)`,
            animationDuration: `${2 + Math.random() * 3}s`,
          }}
          animate={{ y: [0, 20, -20, 0] }}
          transition={{ repeat: Infinity, duration: 6 + i, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [newEventName, setNewEventName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [eventOrder, setEventOrder] = useState<any[]>([]);
  let themeIdx = 0;
  try {
    themeIdx = useContext(ThemeContext).themeIdx;
  } catch (e) {
    console.error("ThemeContext error", e);
    themeIdx = 0;
  }

  // グループ情報リアルタイム取得
  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGroup(snap.exists() ? { id: groupId, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [groupId]);

  // イベント一覧リアルタイム取得
  useEffect(() => {
    if (!groupId) return;
    const q = query(collection(db, "groups", groupId, "events"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [groupId]);

  useEffect(() => { setEventOrder(events); }, [events]);

  // イベント作成
  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;
    await addDoc(collection(db, "groups", groupId, "events"), {
      name: newEventName,
      createdAt: serverTimestamp(),
      participants: group?.members || [],
      payments: {},
      result: null,
    });
    setNewEventName("");
  };

  // グループ名編集
  const handleSaveGroupName = async () => {
    await updateDoc(doc(db, "groups", groupId), { name: editGroupName });
    setShowSettings(false);
  };
  // グループ削除
  const handleDeleteGroup = async () => {
    if (!window.confirm("本当にこのグループを削除しますか？")) return;
    await deleteDoc(doc(db, "groups", groupId));
    router.push("/");
  };
  // イベント削除
  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("本当にこのイベントを削除しますか？")) return;
    await deleteDoc(doc(db, "groups", groupId, "events", eventId));
  };
  // イベント並べ替え
  const moveEvent = (from: number, to: number) => {
    if (to < 0 || to >= eventOrder.length) return;
    const arr = [...eventOrder];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setEventOrder(arr);
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (!group) return <div className="p-10 text-center">グループが見つかりません</div>;

  return (
    <div className={`relative min-h-screen flex flex-col items-center py-10 px-4 bg-gradient-to-br ${THEMES[themeIdx].bg} overflow-hidden`}>
      <AnimatedParticles themeIdx={themeIdx} />
      <button
        className="fixed top-6 left-6 z-20 px-4 py-2 rounded-full bg-white/80 text-gray-700 font-bold shadow hover:scale-105 transition-all"
        onClick={() => router.push("/")}
      >← ホームへ戻る</button>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="w-full flex flex-col items-center"
      >
        <GlassCard className="w-full max-w-2xl mb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold">グループ: {group.name}</h1>
            <button onClick={()=>{setEditGroupName(group.name);setShowSettings(true);}} className="px-3 py-1 rounded-full bg-gray-300 text-gray-700 font-bold">⚙️設定</button>
          </div>
          <div className="mb-2">オーナー: {group.owner}</div>
          <div className="mb-2">メンバー: {group.members?.map((m:any) => m.name).join(", ")}</div>
          <div className="mb-2">グループID: <span className="font-mono">{groupId}</span></div>
          <button
            className="px-4 py-2 rounded-full bg-green-400 text-white font-bold mt-2"
            onClick={() => {
              const url = `${window.location.origin}/group/${groupId}`;
              if (navigator.share) {
                navigator.share({ url, text: `グループ「${group.name}」に参加しよう！` });
              } else {
                window.open(`https://line.me/R/msg/text/?${encodeURIComponent(`グループ「${group.name}」に参加しよう！\n${url}`)}`);
              }
            }}
          >LINEで招待</button>
        </GlassCard>
        <GlassCard className="w-full max-w-2xl mb-6">
          <h2 className="text-xl font-bold mb-2">イベント一覧</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newEventName}
              onChange={e => setNewEventName(e.target.value)}
              placeholder="イベント名（例: 飲み会）"
              className="rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none text-base flex-1"
            />
            <button
              onClick={handleCreateEvent}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-bold shadow hover:scale-105 transition-all"
            >作成</button>
          </div>
          <ul className="space-y-4">
            {eventOrder.map((ev, i) => (
              <li key={ev.id} className="bg-white/40 rounded-lg px-4 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-lg">{ev.name}</span>
                  <button
                    className="px-3 py-1 rounded-full bg-blue-400 text-white text-sm font-bold hover:scale-105 transition-all"
                    onClick={() => router.push(`/group/${groupId}/event/${ev.id}`)}
                  >割り勘へ</button>
                </div>
                {ev.result && (
                  <div className="bg-white/70 rounded-lg p-3 mt-2 text-sm">
                    <div className="mb-1 font-bold">割り勘結果</div>
                    <div>1人あたり: {ev.result.per}円</div>
                    <div>合計: {ev.result.total}円</div>
                    <div>各人負担額: {ev.result.details && ev.result.details.map((d:number,i:number)=>(<span key={i} className="inline-block mx-1 px-2 py-1 rounded-full bg-white/50 text-gray-700 text-xs">{ev.participants && ev.participants[i]?.name}: {d}円</span>))}</div>
                    <div>送金ルート:</div>
                    <ul>
                      {ev.result.settlements && ev.result.settlements.length > 0 ? ev.result.settlements.map((s:any,i:number)=>(
                        <li key={i}>{ev.participants && ev.participants[s.from]?.name} → {ev.participants && ev.participants[s.to]?.name} : {s.amount}円</li>
                      )) : <li>精算不要です</li>}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      </motion.div>
      {/* 設定モーダル */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">グループ設定</h2>
            <div className="mb-4">
              <label className="block font-bold mb-1">グループ名</label>
              <input type="text" value={editGroupName} onChange={e=>setEditGroupName(e.target.value)} className="w-full rounded-xl px-4 py-2 border border-gray-300" />
              <button onClick={handleSaveGroupName} className="mt-2 px-4 py-2 rounded-full bg-blue-500 text-white font-bold">保存</button>
            </div>
            <div className="mb-4">
              <button onClick={handleDeleteGroup} className="px-4 py-2 rounded-full bg-red-500 text-white font-bold">グループ削除</button>
            </div>
            <div className="mb-4">
              <label className="block font-bold mb-1">イベント並べ替え・削除</label>
              <ul className="space-y-2">
                {eventOrder.map((ev, i) => (
                  <li key={ev.id} className="flex items-center gap-2">
                    <span className="flex-1">{ev.name}</span>
                    <button onClick={()=>moveEvent(i,i-1)} className="px-2 py-1 bg-gray-200 rounded">↑</button>
                    <button onClick={()=>moveEvent(i,i+1)} className="px-2 py-1 bg-gray-200 rounded">↓</button>
                    <button onClick={()=>handleDeleteEvent(ev.id)} className="px-2 py-1 bg-red-400 text-white rounded">削除</button>
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={()=>setShowSettings(false)} className="mt-2 px-4 py-2 rounded-full bg-gray-400 text-white font-bold">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
} 