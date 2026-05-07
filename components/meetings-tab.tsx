'use client';

import { FirefliesMeeting, OnboardingItem, SubItem } from '@/lib/types';
import { ActionItemsModal } from './action-items-modal';
import { Video, Clock, Users, ChevronDown, ChevronUp, ExternalLink, Play, ListChecks } from 'lucide-react';
import { useState } from 'react';

interface MeetingsTabProps {
  meetings: FirefliesMeeting[];
  loading: boolean;
  items: OnboardingItem[];
  clientItemId: string;
  onTasksCreated: (tasks: SubItem[]) => void;
}

function MeetingCard({
  meeting,
  items,
  clientItemId,
  onTasksCreated,
}: {
  meeting: FirefliesMeeting;
  items: OnboardingItem[];
  clientItemId: string;
  onTasksCreated: (tasks: SubItem[]) => void;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [videoOpen, setVideoOpen]     = useState(false);
  const [showImport, setShowImport]   = useState(false);

  const totalMin = Math.round(meeting.duration / 60);
  const durationStr = totalMin <= 0
    ? null
    : totalMin < 60
      ? `${totalMin}m`
      : `${Math.floor(totalMin / 60)}h ${totalMin % 60 > 0 ? `${totalMin % 60}m` : ''}`;
  const dateStr = meeting.date
    ? new Date(meeting.date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : 'Unknown date';

  const hasDetails    = !!(meeting.summary || meeting.actionItems?.length);
  const hasActionItems = (meeting.actionItems?.length ?? 0) > 0;

  return (
    <>
      <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Video className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {meeting.url ? (
                <a
                  href={meeting.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline text-[#015280] flex items-center gap-1 group"
                >
                  <span className="truncate">{meeting.title}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ) : (
                <h4 className="text-sm font-medium text-gray-900">{meeting.title}</h4>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                <span>{dateStr}</span>
                {durationStr && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {durationStr}
                  </span>
                )}
                {meeting.participants.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3" /> {meeting.participants.length}
                  </span>
                )}
                {meeting.videoUrl && (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(v => !v)}
                    className="flex items-center gap-0.5 text-purple-600 hover:text-purple-800 font-medium transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    {videoOpen ? 'Hide video' : 'Watch'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Import action items button */}
            {hasActionItems && (
              <button
                onClick={() => setShowImport(true)}
                title="Add action items as tasks"
                className="flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-400 px-2 py-1 rounded-lg transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add to tasks</span>
              </button>
            )}

            {hasDetails && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {videoOpen && meeting.videoUrl && (
          <div className="mt-3">
            <video src={meeting.videoUrl} controls className="w-full rounded-lg max-h-64 bg-black">
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {expanded && (
          <div className="mt-3 pl-6 space-y-2">
            {meeting.summary && (
              <div>
                <h5 className="text-xs font-semibold text-gray-500 mb-1">Summary</h5>
                <p className="text-xs text-gray-700">{meeting.summary}</p>
              </div>
            )}
            {hasActionItems && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h5 className="text-xs font-semibold text-gray-500">Action Items</h5>
                  <button
                    onClick={() => setShowImport(true)}
                    className="text-xs text-purple-600 hover:underline font-medium"
                  >
                    Add all to tasks →
                  </button>
                </div>
                <ul className="space-y-1">
                  {meeting.actionItems!.map((item, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                      <span className="text-[#43c7ff] mt-0.5">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action items import modal */}
      {showImport && (
        <ActionItemsModal
          meeting={meeting}
          items={items}
          clientItemId={clientItemId}
          onClose={() => setShowImport(false)}
          onTasksCreated={tasks => {
            onTasksCreated(tasks);
            setShowImport(false);
          }}
        />
      )}
    </>
  );
}

export function MeetingsTab({ meetings, loading, items, clientItemId, onTasksCreated }: MeetingsTabProps) {
  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
        <span className="ml-2 text-sm text-gray-500">Searching Fireflies...</span>
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Video className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">No meetings found for this client</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
      <p className="text-xs text-gray-500 mb-3">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} found</p>
      {meetings.map(meeting => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          items={items}
          clientItemId={clientItemId}
          onTasksCreated={onTasksCreated}
        />
      ))}
    </div>
  );
}
