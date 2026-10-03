import { useEffect, useMemo, useState } from 'react';
import {
  Apple, CalendarDays, CheckCircle2, Dumbbell, Footprints, GlassWater,
  Goal, Leaf, PartyPopper, Plus, Save, Scale, Smartphone, Trophy, X,
} from 'lucide-react';

type FitnessLog = {
  id: string;
  date: string;
  weight: string;
  activityMinutes: string;
  workout: string;
  fruitVegServings: string;
  waterGlasses: string;
  notes: string;
};

type FitnessPlannerState = {
  unit: 'kg' | 'lb';
  startDate: string;
  startWeight: string;
  goalWeight: string;
  targetDate: string;
  logs: FitnessLog[];
};

const emptyState: FitnessPlannerState = {
  unit: 'kg',
  startDate: new Date().toISOString().slice(0, 10),
  startWeight: '',
  goalWeight: '',
  targetDate: '',
  logs: [],
};

const blankLog = (): FitnessLog => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  date: new Date().toISOString().slice(0, 10),
  weight: '',
  activityMinutes: '',
  workout: '',
  fruitVegServings: '',
  waterGlasses: '',
  notes: '',
});

export default function FitnessProgressPlanner({ storageKey }: { storageKey: string }) {
  const [state, setState] = useState<FitnessPlannerState>(emptyState);
  const [draft, setDraft] = useState<FitnessLog>(blankLog());
  const [showForm, setShowForm] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as FitnessPlannerState;
        setState({ ...emptyState, ...parsed, logs: Array.isArray(parsed.logs) ? parsed.logs : [] });
      }
    } catch {
      // Keep a usable empty planner if local storage is unavailable or malformed.
    }
  }, [storageKey]);

  const persist = (next: FitnessPlannerState) => {
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const latestWeight = useMemo(() => {
    const withWeight = state.logs
      .filter((log) => Number(log.weight) > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
    return withWeight[0]?.weight || state.startWeight;
  }, [state.logs, state.startWeight]);

  const progress = useMemo(() => {
    const start = Number(state.startWeight);
    const goal = Number(state.goalWeight);
    const current = Number(latestWeight);
    if (!start || !goal || !current || start === goal) return 0;
    const total = Math.abs(start - goal);
    const moved = goal < start ? start - current : current - start;
    return Math.max(0, Math.min(100, Math.round((moved / total) * 100)));
  }, [state.startWeight, state.goalWeight, latestWeight]);

  const targetPace = useMemo(() => {
    const start = Number(state.startWeight);
    const goal = Number(state.goalWeight);
    if (!start || !goal || !state.startDate || !state.targetDate) return null;
    const startMs = new Date(state.startDate + 'T00:00:00').getTime();
    const targetMs = new Date(state.targetDate + 'T00:00:00').getTime();
    const weeks = Math.max(1, (targetMs - startMs) / (7 * 24 * 60 * 60 * 1000));
    return Math.abs(start - goal) / weeks;
  }, [state.startWeight, state.goalWeight, state.startDate, state.targetDate]);

  const milestones = useMemo(() => {
    const completed = [
      state.logs.length >= 1,
      state.logs.length >= 7,
      progress >= 25,
      progress >= 50,
      progress >= 75,
      progress >= 100,
    ];
    return [
      ['First check-in', completed[0]],
      ['7 check-ins', completed[1]],
      ['25% to goal', completed[2]],
      ['Halfway', completed[3]],
      ['75% to goal', completed[4]],
      ['Goal reached', completed[5]],
    ] as Array<[string, boolean]>;
  }, [state.logs.length, progress]);

  const saveGoal = () => persist({ ...state });

  const addLog = () => {
    if (!draft.date) return;
    const nextLogs = [...state.logs.filter((item) => item.date !== draft.date), draft]
      .sort((a, b) => b.date.localeCompare(a.date));
    persist({ ...state, logs: nextLogs });
    setDraft(blankLog());
    setShowForm(false);
  };

  const removeLog = (id: string) => persist({ ...state, logs: state.logs.filter((log) => log.id !== id) });

  return (
    <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-4 md:p-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700">
            <Trophy className="w-5 h-5" />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Interactive fitness planner</p>
          </div>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Track your goal. Celebrate your progress.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Record weight, activity, workouts, fruit/vegetable servings, hydration and notes. Your entries stay on this device.
            This is a habit tracker, not a medical diagnosis or a promise of a specific rate of weight change.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={state.unit}
            onChange={(e) => persist({ ...state, unit: e.target.value as 'kg' | 'lb' })}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Check-in
          </button>
        </div>
      </div>

      <div className="mt-5 grid md:grid-cols-2 xl:grid-cols-5 gap-3">
        <PlannerField icon={CalendarDays} label="Start date">
          <input type="date" value={state.startDate} onChange={(e) => setState({ ...state, startDate: e.target.value })} className="w-full bg-transparent font-bold outline-none" />
        </PlannerField>
        <PlannerField icon={Scale} label={'Starting weight (' + state.unit + ')'}>
          <input type="number" min="1" step="0.1" value={state.startWeight} onChange={(e) => setState({ ...state, startWeight: e.target.value })} className="w-full bg-transparent font-bold outline-none" placeholder="e.g. 82" />
        </PlannerField>
        <PlannerField icon={Goal} label={'Goal weight (' + state.unit + ')'}>
          <input type="number" min="1" step="0.1" value={state.goalWeight} onChange={(e) => setState({ ...state, goalWeight: e.target.value })} className="w-full bg-transparent font-bold outline-none" placeholder="e.g. 72" />
        </PlannerField>
        <PlannerField icon={CalendarDays} label="Target date">
          <input type="date" value={state.targetDate} onChange={(e) => setState({ ...state, targetDate: e.target.value })} className="w-full bg-transparent font-bold outline-none" />
        </PlannerField>
        <button type="button" onClick={saveGoal} className="rounded-2xl bg-slate-950 text-white px-4 py-3 font-black inline-flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> {savedFlash ? 'Saved' : 'Save goal'}
        </button>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Goal progress</p>
            <p className="mt-1 text-2xl font-black">{progress}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Latest recorded weight</p>
            <p className="font-black">{latestWeight ? latestWeight + ' ' + state.unit : 'Not recorded yet'}</p>
          </div>
        </div>
        <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-all" style={{ width: progress + '%' }} />
        </div>
        {targetPace != null && (
          <p className="mt-3 text-xs leading-5 text-slate-300">
            Your dates imply an average change of about <strong className="text-white">{targetPace.toFixed(2)} {state.unit}/week</strong>.
            Treat this only as planning math. Individual safe/realistic rates vary, and medical conditions, medicines, pregnancy, eating-disorder concerns or rapid/unexplained weight changes should be discussed with a qualified clinician.
          </p>
        )}
      </div>

      <div className="mt-5 grid lg:grid-cols-[1.2fr_.8fr] gap-4">
        <div className="rounded-2xl border border-emerald-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-black text-slate-950">Recent check-ins</p>
              <p className="text-xs text-slate-500">One entry per day. A new entry replaces that date’s older entry.</p>
            </div>
            <button type="button" onClick={() => setShowForm(true)} className="text-xs font-black text-emerald-700">+ Add</button>
          </div>
          {state.logs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No check-ins yet.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {state.logs.slice(0, 10).map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-900">{new Date(log.date + 'T00:00:00').toLocaleDateString()}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                        {log.weight && <Chip icon={Scale} text={log.weight + ' ' + state.unit} />}
                        {log.activityMinutes && <Chip icon={Footprints} text={log.activityMinutes + ' active min'} />}
                        {log.workout && <Chip icon={Dumbbell} text={log.workout} />}
                        {log.fruitVegServings && <Chip icon={Leaf} text={log.fruitVegServings + ' fruit/veg servings'} />}
                        {log.waterGlasses && <Chip icon={GlassWater} text={log.waterGlasses + ' glasses water'} />}
                      </div>
                      {log.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{log.notes}</p>}
                    </div>
                    <button type="button" onClick={() => removeLog(log.id)} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-rose-600"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2"><PartyPopper className="w-5 h-5 text-amber-700" /><p className="font-black text-amber-950">Milestones</p></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {milestones.map(([label, done]) => (
                <div key={label} className={'rounded-xl border p-3 text-xs font-bold ' + (done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-white/70 text-slate-500')}>
                  {done ? <CheckCircle2 className="w-4 h-4 mb-1" /> : <Trophy className="w-4 h-4 mb-1 opacity-40" />}{label}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-blue-700" /><p className="font-black text-blue-950">Workout app toolkit</p></div>
            <p className="mt-2 text-xs leading-5 text-blue-900">Use an app if it makes consistency easier. DRIGHT does not require any paid subscription.</p>
            <div className="mt-3 space-y-2">
              <ResourceLink label="Hevy — workout planner & log" href="https://www.hevyapp.com/" note="Routine planning, exercise logging and progress history." />
              <ResourceLink label="Nike Training Club" href="https://www.nike.com/ntc-app" note="Strength, conditioning, yoga, Pilates and recovery workouts." />
              <ResourceLink label="FitOn" href="https://fitonapp.com/" note="Cardio, strength, HIIT, yoga and guided workout plans." />
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[80] bg-black/55 p-4 flex items-end sm:items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Daily / weekly record</p><h3 className="text-xl font-black">Add fitness check-in</h3></div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-full bg-slate-100 p-2"><X className="w-4 h-4" /></button>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <Input label="Date"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></Input>
              <Input label={'Weight (' + state.unit + ')'}><input type="number" step="0.1" min="1" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></Input>
              <Input label="Activity minutes"><input type="number" min="0" value={draft.activityMinutes} onChange={(e) => setDraft({ ...draft, activityMinutes: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="e.g. 30" /></Input>
              <Input label="Workout"><input value={draft.workout} onChange={(e) => setDraft({ ...draft, workout: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Walk, strength, jog…" /></Input>
              <Input label="Fruit/vegetable servings"><input type="number" min="0" step="1" value={draft.fruitVegServings} onChange={(e) => setDraft({ ...draft, fruitVegServings: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></Input>
              <Input label="Glasses of water"><input type="number" min="0" step="1" value={draft.waterGlasses} onChange={(e) => setDraft({ ...draft, waterGlasses: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></Input>
            </div>
            <Input label="Notes">
              <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="What felt easy, hard, different, or worth repeating?" />
            </Input>
            <button type="button" onClick={addLog} className="mt-4 w-full min-h-[50px] rounded-2xl bg-emerald-600 text-white font-black inline-flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Save check-in</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PlannerField({ icon: Icon, label, children }: { icon: typeof Scale; label: string; children: React.ReactNode }) {
  return <label className="rounded-2xl border border-emerald-100 bg-white p-3"><span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500"><Icon className="w-4 h-4 text-emerald-600" />{label}</span><span className="mt-2 block">{children}</span></label>;
}

function Input({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mt-3"><span className="mb-1.5 block text-xs font-black text-slate-600">{label}</span>{children}</label>;
}

function Chip({ icon: Icon, text }: { icon: typeof Scale; text: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 border border-slate-200"><Icon className="w-3 h-3" />{text}</span>;
}

function ResourceLink({ label, href, note }: { label: string; href: string; note: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="block rounded-xl bg-white/80 border border-blue-100 p-3 hover:bg-white"><p className="text-xs font-black text-blue-950">{label}</p><p className="mt-1 text-[11px] leading-4 text-blue-700">{note}</p></a>;
}
