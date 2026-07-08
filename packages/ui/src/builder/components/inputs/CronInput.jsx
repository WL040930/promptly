import React, { useState, useEffect } from 'react';

const selectClass = "bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner appearance-none cursor-pointer pr-8";
const numberClass = "bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner w-20 text-center";
const textClass = "w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner font-mono";

const DAYS = [
    { label: 'Sunday', value: '0' },
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' }
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i.toString()
}));

export default function CronInput({ value = '0 9 * * *', onChange }) {
    // Parsing logic
    const parseCron = (expr) => {
        if (!expr) return { mode: 'days', interval: 1, hour: '9', day: '1', customValue: '0 9 * * *' };
        
        let m;
        if ((m = expr.match(/^\*\/(\d+) \* \* \* \*$/))) return { mode: 'minutes', interval: m[1], hour: '9', day: '1', customValue: expr };
        if ((m = expr.match(/^0 \*\/(\d+) \* \* \*$/))) return { mode: 'hours', interval: m[1], hour: '9', day: '1', customValue: expr };
        if ((m = expr.match(/^0 (\d+) \* \* \*$/))) return { mode: 'days', interval: 1, hour: m[1], day: '1', customValue: expr };
        if ((m = expr.match(/^0 (\d+) \* \* (\d+)$/))) return { mode: 'weeks', interval: 1, hour: m[1], day: m[2], customValue: expr };
        
        return { mode: 'custom', interval: 1, hour: '9', day: '1', customValue: expr };
    };

    const parsed = parseCron(value);

    const [mode, setMode] = useState(parsed.mode);
    const [interval, setIntervalVal] = useState(parsed.interval);
    const [hour, setHour] = useState(parsed.hour);
    const [day, setDay] = useState(parsed.day);
    const [customValue, setCustomValue] = useState(parsed.customValue);

    // Update parent when any state changes
    useEffect(() => {
        let newCron = '';
        if (mode === 'minutes') newCron = `*/${interval || 1} * * * *`;
        else if (mode === 'hours') newCron = `0 */${interval || 1} * * *`;
        else if (mode === 'days') newCron = `0 ${hour} * * *`;
        else if (mode === 'weeks') newCron = `0 ${hour} * * ${day}`;
        else newCron = customValue;

        if (newCron !== value) {
            onChange(newCron);
        }
    }, [mode, interval, hour, day, customValue]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-600">Trigger</span>
                
                <div className="relative">
                    <select value={mode} onChange={e => setMode(e.target.value)} className={selectClass}>
                        <option value="minutes">Every X Minutes</option>
                        <option value="hours">Every X Hours</option>
                        <option value="days">Every Day</option>
                        <option value="weeks">Every Week</option>
                        <option value="custom">Custom Expression</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>

                {/* Minutes / Hours input */}
                {(mode === 'minutes' || mode === 'hours') && (
                    <>
                        <span className="text-sm text-slate-600 animate-in fade-in slide-in-from-left-2 duration-200">every</span>
                        <input
                            type="number"
                            min="1"
                            max="59"
                            value={interval}
                            onChange={e => setIntervalVal(e.target.value)}
                            className={`${numberClass} animate-in fade-in slide-in-from-left-2 duration-200`}
                        />
                        <span className="text-sm text-slate-600 animate-in fade-in slide-in-from-left-2 duration-200">{mode}</span>
                    </>
                )}

                {/* Days input */}
                {(mode === 'days' || mode === 'weeks') && (
                    <>
                        <span className="text-sm text-slate-600 animate-in fade-in slide-in-from-left-2 duration-200">at</span>
                        <div className="relative animate-in fade-in slide-in-from-left-2 duration-200">
                            <select value={hour} onChange={e => setHour(e.target.value)} className={selectClass}>
                                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                    </>
                )}

                {/* Weeks input */}
                {mode === 'weeks' && (
                    <>
                        <span className="text-sm text-slate-600 animate-in fade-in slide-in-from-left-2 duration-200">on</span>
                        <div className="relative animate-in fade-in slide-in-from-left-2 duration-200">
                            <select value={day} onChange={e => setDay(e.target.value)} className={selectClass}>
                                {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Custom input with Tutorial */}
            {mode === 'custom' && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                        type="text"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="* * * * *"
                        className={textClass}
                    />
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-1 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">Cron Tutorial</div>
                        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                            A cron expression consists of 5 fields separated by spaces. Use numbers, <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-600">*</code> (every), or <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-600">*/X</code> (every X).
                        </p>
                        
                        <div className="grid grid-cols-5 gap-2 text-center text-[10px] font-mono">
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-white border border-slate-200 rounded w-full py-1 text-indigo-600 font-bold">1st</div>
                                <span className="text-slate-600">Minute</span>
                                <span className="text-slate-400 text-[9px]">(0-59)</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-white border border-slate-200 rounded w-full py-1 text-indigo-600 font-bold">2nd</div>
                                <span className="text-slate-600">Hour</span>
                                <span className="text-slate-400 text-[9px]">(0-23)</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-white border border-slate-200 rounded w-full py-1 text-indigo-600 font-bold">3rd</div>
                                <span className="text-slate-600">Day</span>
                                <span className="text-slate-400 text-[9px]">(1-31)</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-white border border-slate-200 rounded w-full py-1 text-indigo-600 font-bold">4th</div>
                                <span className="text-slate-600">Month</span>
                                <span className="text-slate-400 text-[9px]">(1-12)</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-white border border-slate-200 rounded w-full py-1 text-indigo-600 font-bold">5th</div>
                                <span className="text-slate-600">Weekday</span>
                                <span className="text-slate-400 text-[9px]">(0-6)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {mode !== 'custom' && (
                <div className="text-[10px] text-slate-400 font-mono mt-1 px-1">
                    Expression: {value}
                </div>
            )}
        </div>
    );
}
