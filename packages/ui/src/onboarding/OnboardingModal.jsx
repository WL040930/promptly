import React, { useState } from 'react';
import { apiRequest } from '../api/client.js';

const OnboardingModal = ({ user, onOnboardingComplete }) => {
    const [selectedRole, setSelectedRole] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSelectRole = (role) => {
        setSelectedRole(role);
    };

    const handleSubmit = async () => {
        if (!selectedRole) return;
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await apiRequest('/api/auth/onboarding', {
                method: 'PUT',
                body: JSON.stringify({ experienceLevel: selectedRole })
            });

            if (onOnboardingComplete) {
                onOnboardingComplete(response.user);
            }
        } catch (err) {
            setError(err?.message || 'Failed to save onboarding preference. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in font-['Space_Grotesk','Manrope',sans-serif]">
            <div className="glass-card w-full max-w-[840px] rounded-3xl p-10 md:p-12 flex flex-col items-center text-center relative overflow-hidden">
                {/* Decorative blob in corner */}
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-100/60 rounded-full blur-[80px] pointer-events-none -z-10"></div>
                
                {/* Header */}
                <div className="mb-10 w-full max-w-2xl mx-auto z-10">
                    <div className="inline-flex px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-sm font-bold uppercase tracking-widest border border-blue-100 mb-6">
                        Personalization Wizard
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4 bg-clip-text">
                        Customize Your Workspace
                    </h2>
                    <p className="text-lg text-slate-600 leading-relaxed">
                        Select the path that fits you best. We will optimize your dashboard interface to match your workflow and technical experience.
                    </p>
                </div>

                {/* Option Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mb-10 z-10">
                    {/* Newbie Card */}
                    <div
                        onClick={() => handleSelectRole('newbie')}
                        className={`group relative flex flex-col items-center text-center p-8 rounded-2xl cursor-pointer transition-all duration-300 ${
                            selectedRole === 'newbie'
                                ? 'bg-white border-2 border-cyan-400 shadow-[0_15px_40px_rgba(34,211,238,0.15)] -translate-y-2'
                                : 'bg-white/60 border-2 border-slate-200 hover:bg-white hover:border-cyan-300 hover:shadow-xl hover:-translate-y-1'
                        }`}
                    >
                        <div className={`w-20 h-20 rounded-2xl grid place-items-center mb-6 transition-colors duration-300 ${
                            selectedRole === 'newbie' ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400 group-hover:bg-cyan-50 group-hover:text-cyan-500'
                        }`}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5"></path>
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"></path>
                                <path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"></path>
                                <path d="M12 2c4 4 4 9 2 12s-8 2-12-2 2-8 12-12z"></path>
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">
                            I am a Newbie
                        </h3>
                        <p className="text-slate-600 text-[0.95rem] leading-relaxed">
                            I want a friendly, conversational assistant that helps me write prompts and automates complex operations with ease.
                        </p>
                    </div>

                    {/* IT Professional Card */}
                    <div
                        onClick={() => handleSelectRole('professional')}
                        className={`group relative flex flex-col items-center text-center p-8 rounded-2xl cursor-pointer transition-all duration-300 ${
                            selectedRole === 'professional'
                                ? 'bg-white border-2 border-blue-500 shadow-[0_15px_40px_rgba(59,130,246,0.15)] -translate-y-2'
                                : 'bg-white/60 border-2 border-slate-200 hover:bg-white hover:border-blue-300 hover:shadow-xl hover:-translate-y-1'
                        }`}
                    >
                        <div className={`w-20 h-20 rounded-2xl grid place-items-center mb-6 transition-colors duration-300 ${
                            selectedRole === 'professional' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500'
                        }`}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="4 17 10 11 4 5"></polyline>
                                <line x1="12" y1="19" x2="20" y2="19"></line>
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">
                            IT Professional
                        </h3>
                        <p className="text-slate-600 text-[0.95rem] leading-relaxed">
                            I need advanced sandbox prompt consoles, performance metrics, template configurations, and direct database integrations.
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mb-6 px-6 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold text-sm max-w-lg z-10 flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        {error}
                    </div>
                )}

                {/* Footer Controls */}
                <button
                    onClick={handleSubmit}
                    disabled={!selectedRole || isSubmitting}
                    className={`z-10 px-10 py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
                        selectedRole && !isSubmitting
                            ? 'bg-blue-600 text-white shadow-xl hover:bg-blue-700 hover:shadow-2xl hover:-translate-y-1 cursor-pointer'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    {isSubmitting ? 'Optimizing Workspace...' : 'Activate Workspace'}
                </button>
            </div>
        </div>
    );
};

export default OnboardingModal;
