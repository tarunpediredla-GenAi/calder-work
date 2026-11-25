import { FormEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Project } from '../types/calder';

const STUDENT_REGISTER_EXAMPLE =
  'Give the college administrator a student register. Staff should be able to add a student using a roll number, name and department, search by roll number, and see a clear error if the roll number already exists.';

interface WorkItemModalProps {
  open: boolean;
  projects: Project[];
  reviewers: string[];
  initialProjectId: string;
  onClose: () => void;
  onSubmit: (payload: {
    projectId: string;
    title?: string;
    requestText: string;
    assignedReviewer: string;
  }) => Promise<void>;
}

export function WorkItemModal({
  open,
  projects,
  reviewers,
  initialProjectId,
  onClose,
  onSubmit,
}: WorkItemModalProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [title, setTitle] = useState('');
  const [requestText, setRequestText] = useState('');
  const [assignedReviewer, setAssignedReviewer] = useState(
    reviewers[0] || 'Priya Nair'
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectId(initialProjectId || projects[0]?.id || '');
      setError(null);
    }
  }, [open, initialProjectId, projects]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (requestText.trim().length < 12) {
      setError('Describe the feature request in at least 12 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        projectId,
        title: title.trim() || undefined,
        requestText: requestText.trim(),
        assignedReviewer,
      });
      setTitle('');
      setRequestText('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit work item.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-work-item-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
    >
      <div className="w-full max-w-xl rounded border border-[#E5E1D8] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E1D8] px-5 py-4">
          <h2
            id="new-work-item-title"
            className="text-base font-semibold text-[#1A1C1E]"
          >
            Submit feature request
          </h2>
          <button
            type="button"
            aria-label="Close submit feature request dialog"
            onClick={onClose}
            className="rounded p-1 text-[#5C6066] hover:bg-[#F4F2EC]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {error && (
            <div
              role="alert"
              className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="wi-project-select"
                className="mb-1 block text-xs font-medium text-[#1A1C1E]"
              >
                Project
              </label>
              <select
                id="wi-project-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.repository})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="wi-reviewer-select"
                className="mb-1 block text-xs font-medium text-[#1A1C1E]"
              >
                Assigned reviewer
              </label>
              <select
                id="wi-reviewer-select"
                value={assignedReviewer}
                onChange={(e) => setAssignedReviewer(e.target.value)}
                className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
              >
                {reviewers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="wi-title-input"
              className="mb-1 block text-xs font-medium text-[#1A1C1E]"
            >
              Short title (optional)
            </label>
            <input
              id="wi-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Derived automatically from the request if left blank"
              className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor="wi-request-textarea"
                className="block text-xs font-medium text-[#1A1C1E]"
              >
                Feature request
              </label>
              <button
                type="button"
                onClick={() => {
                  const campus = projects.find((p) =>
                    p.name.toLowerCase().includes('campus')
                  );
                  if (campus) setProjectId(campus.id);
                  setRequestText(STUDENT_REGISTER_EXAMPLE);
                }}
                className="text-xs font-medium text-[#1E40AF] hover:text-[#1E3A8A]"
              >
                Fill student register demo
              </button>
            </div>
            <textarea
              id="wi-request-textarea"
              rows={4}
              required
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="Describe the user goal, required fields, search or validation rules, and error handling..."
              className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm leading-relaxed text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#ECE9E1] pt-4">
            <span className="text-xs text-[#5C6066]">
              Requirements analyst drafts acceptance criteria before code
              generation.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[#D4CFC4] px-3.5 py-2 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? 'Submitting...' : 'Create work item'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
