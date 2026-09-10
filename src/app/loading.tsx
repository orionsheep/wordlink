export default function Loading() {
    return (
        <div className="min-h-screen w-full bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
                <span className="text-xs text-neutral-500 tracking-widest uppercase">Loading…</span>
            </div>
        </div>
    );
}
