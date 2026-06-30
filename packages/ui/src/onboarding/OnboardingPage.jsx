import React, { useState } from 'react';
import { apiRequest } from '../api/client.js';
import WorkspaceSelectionStep from './WorkspaceSelectionStep';
import TutorialStep from './TutorialStep';

const OnboardingPage = ({ user, onOnboardingComplete }) => {
    const [step, setStep] = useState(1);
    const [selectedRole, setSelectedRole] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

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
        <div className="min-h-screen bg-[#f7f9fc] flex flex-col items-center justify-center p-4 md:p-8 font-sans relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-100/40 rounded-full blur-[100px] pointer-events-none z-0"></div>
            <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-100/40 rounded-full blur-[100px] pointer-events-none z-0"></div>
            
            {/* Logo - Top Left */}
            <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-400 grid place-items-center font-extrabold text-white shadow-sm">
                    P
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-800">
                    Promptly
                </span>
            </div>

            {/* Step Indicators */}
            <div className="absolute top-8 right-8 z-10 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Step {step} of 4</span>
                <div className="flex gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step >= 1 ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step >= 3 ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step >= 4 ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                </div>
            </div>

            {step === 1 ? (
                <WorkspaceSelectionStep 
                    selectedRole={selectedRole} 
                    onSelectRole={setSelectedRole} 
                    onNext={() => setStep(2)} 
                />
            ) : (
                <TutorialStep 
                    selectedRole={selectedRole} 
                    tutorialStepIndex={step - 1}
                    onNext={() => setStep(step + 1)}
                    onBack={() => setStep(step - 1)} 
                    onSubmit={handleSubmit} 
                    isSubmitting={isSubmitting} 
                    error={error} 
                />
            )}
        </div>
    );
};

export default OnboardingPage;
