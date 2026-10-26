import React from 'react';

export default function DegreeProgress({ modules, requirements }) {
  const includedRequirements = requirements.filter(req => req.countTowardsTotal !== false);
  const includedContainers = new Set(includedRequirements.map(req => req.title));
  const includedModules = modules.filter(module => includedContainers.has(module.container));

  const totalRequiredCredits = includedRequirements.reduce((sum, requirement) => sum + requirement.requiredCredits, 0);
  const totalEarnedCredits = includedModules.filter((module) => module.status === 'Completed').reduce((sum, module) => sum + module.credits, 0);
  const totalInProgressCredits = includedModules.filter((module) => module.status === 'In Progress').reduce((sum, module) => sum + module.credits, 0);
  const totalPlannedCredits = includedModules.filter((module) => module.status === 'Planned').reduce((sum, module) => sum + module.credits, 0);
  const totalEarnedPercentage = totalRequiredCredits > 0 ? Math.min((totalEarnedCredits / totalRequiredCredits) * 100, 100) : 0;
  const totalInProgressPercentage = totalRequiredCredits > 0 ? Math.min((totalInProgressCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage) : 0;
  const totalPlannedPercentage = totalRequiredCredits > 0 ? Math.min((totalPlannedCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage - totalInProgressPercentage) : 0;
  const gradedCompletedModules = includedModules.filter((module) => module.status === 'Completed' && typeof module.grade === 'number' && !Number.isNaN(module.grade));
  const weightedGradeSum = gradedCompletedModules.reduce((sum, module) => sum + (module.grade * module.credits), 0);
  const gradedCredits = gradedCompletedModules.reduce((sum, module) => sum + module.credits, 0);
  const averageGrade = gradedCredits > 0 ? (weightedGradeSum / gradedCredits).toFixed(2) : null;

  return (
<div className="overall-progress-section">
        <div className="op-header">
          <h2>Degree Progress</h2>
          <span className="fraction">{totalEarnedCredits} / {totalRequiredCredits} ECTS</span>
        </div>
        <div className="op-header">
          <h2>Current Average</h2>
          <span className="fraction">{averageGrade ?? '-'}</span>
        </div>
        <div className="progress-bar-large">
          <div className="progress-fill earned" style={{ width: `${totalEarnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${totalInProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${totalPlannedPercentage}%` }} />
        </div>
        <div className="credit-summary" aria-label="ECTS by status" aria-live="polite">
          <div className="credit-stat planned"><span>Planned</span><strong>{totalPlannedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat in-progress"><span>In Progress</span><strong>{totalInProgressCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat completed"><span>Completed</span><strong>{totalEarnedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat total"><span>Total allocated</span><strong>{totalPlannedCredits + totalInProgressCredits + totalEarnedCredits}<small>/ {totalRequiredCredits} ECTS</small></strong></div>
        </div>
        <p className="credit-summary-hint">Only included requirements count toward these totals.</p>
      </div>
  );
}
