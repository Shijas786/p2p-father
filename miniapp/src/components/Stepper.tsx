import React from 'react';
import { IconShield, IconCoins, IconHourglass, IconCheck, IconAlertCircle } from './Icons';

interface Step {
    key: string;
    label: string;
}

interface StepperProps {
    steps: Step[];
    currentStepKey: string;
    status: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStepKey, status }) => {
    const currentIndex = steps.findIndex(s => s.key === currentStepKey);
    const isDisputed = status === 'disputed';

    const getIcon = (key: string, index: number) => {
        if (isDisputed && index === currentIndex) return <IconAlertCircle size={14} color="#f87171" />;
        if (index < currentIndex || status === 'completed') return <IconCheck size={14} color="#10b981" />;
        
        switch (key) {
            case 'waiting_for_escrow': return <IconHourglass size={14} color={index === currentIndex ? "#10b981" : "rgba(255,255,255,0.2)"} />;
            case 'in_escrow': return <IconShield size={14} color={index === currentIndex ? "#10b981" : "rgba(255,255,255,0.2)"} />;
            case 'fiat_sent': return <IconCoins size={14} color={index === currentIndex ? "#10b981" : "rgba(255,255,255,0.2)"} />;
            case 'fiat_confirmed': return <IconCheck size={14} color={index === currentIndex ? "#10b981" : "rgba(255,255,255,0.2)"} />;
            case 'completed': return <IconCheck size={14} color={index === currentIndex ? "#10b981" : "rgba(255,255,255,0.2)"} />;
            default: return <span>{index + 1}</span>;
        }
    };

    return (
        <div className="stepper-container">
            <div className="stepper-track">
                {steps.map((step, index) => {
                    const isActive = index === currentIndex;
                    const isCompleted = index < currentIndex || status === 'completed';
                    
                    return (
                        <div key={step.key} className={`stepper-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                            <div className="stepper-node-wrapper">
                                <div className="stepper-node">
                                    {getIcon(step.key, index)}
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`stepper-line ${isCompleted ? 'completed' : ''}`}>
                                        {isActive && !isCompleted && <div className="stepper-line-progress" />}
                                    </div>
                                )}
                            </div>
                            <span className="stepper-label">{step.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
