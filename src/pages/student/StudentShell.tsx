import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '@/services/DataProvider';
import { buildMainBoard } from '@/engine';
import type { BoardEntry } from '@/data/types';

export default function StudentShell() {
    const data = useData();
    const students = data.getStudents();
    const allStudents = data.getStudents(true); // include archived for search
    const enrollments = data.getEnrollments();
    const assessments = data.getAssessments();
    const currentMonth = data.getCurrentMonth();
    const previousMonth = data.getPreviousMonth();
    const config = data.getConfig();

    const [searchQuery, setSearchQuery] = useState('');
    const [showAll, setShowAll] = useState(false); // "See more" toggle

    // Compute the live board via the engine
    const { board } = useMemo(() => {
        return buildMainBoard(students, enrollments, assessments, currentMonth, config);
    }, [students, enrollments, assessments, currentMonth, config]);

    // §3.6 Pre-data fallback: if current month's board is empty, show previous month's board
    const previousBoard = useMemo(() => {
        if (board.length > 0) return null; // current month has data, no fallback needed
        const result = buildMainBoard(students, enrollments, assessments, previousMonth, config);
        return result.board.length > 0 ? result.board : null;
    }, [board, students, enrollments, assessments, previousMonth, config]);

    const isShowingPrevious = board.length === 0 && previousBoard !== null;
    const activeBoard = isShowingPrevious ? previousBoard! : board;

    // §5.3 Search — search FULL NAMES with partial match, results link to profile
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return allStudents.filter(s => s.full_name.toLowerCase().includes(q));
    }, [allStudents, searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    // Pagination: TOP-30 first, then "See more" shows all (§5.1)
    const topN = config.top_n_main_page;
    const visibleBoard = showAll ? activeBoard : activeBoard.slice(0, topN);
    const hasMore = activeBoard.length > topN && !showAll;

    // Top 3 podium (only when not searching and not "see all")
    const showPodium = !isSearching && !showAll;
    const top3 = showPodium ? visibleBoard.slice(0, 3) : [];
    const listEntries = showPodium ? visibleBoard.slice(3) : visibleBoard;

    // Podium array remains in rank order, visual reordering happens via CSS Flex 'order-' classes
    const podiumOrder = top3;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            {/* Logo + Hero Section */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center shadow-glow">
                        <span className="text-white font-black text-lg">SM</span>
                    </div>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-4 shadow-sm border border-primary-100">
                    <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                    {isShowingPrevious ? `Previous Month · ${previousMonth}` : `Live Rankings · ${currentMonth}`}
                </div>
                <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight">
                    Student{' '}
                    <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                        Leaderboard
                    </span>
                </h1>
                <p className="mt-3 text-neutral-500 text-lg max-w-2xl mx-auto">
                    {isShowingPrevious
                        ? 'Showing last month\'s final rankings — live board will appear once new assessments arrive.'
                        : `Tracking performance across ${data.getSubjects().length} subjects with EWMA-weighted ratings.`
                    }
                </p>
            </div>

            {/* Search — §5.3: full name partial match → profile */}
            <div className="max-w-lg mx-auto mb-12 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students by full name..."
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-neutral-200 bg-white text-neutral-800 
                       shadow-card focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                />

                {/* Search Results Dropdown */}
                {isSearching && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-elevated border border-neutral-100 z-50 max-h-80 overflow-y-auto">
                        {searchResults.length === 0 ? (
                            <div className="p-6 text-center text-neutral-400">No students match "{searchQuery}"</div>
                        ) : (
                            searchResults.map(s => (
                                <Link
                                    key={s.id}
                                    to={`/student/${s.id}`}
                                    className="flex items-center gap-4 px-5 py-3 hover:bg-primary-50 transition-colors border-b border-neutral-50 last:border-0"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
                                        {s.full_name.split(' ').map(n => n[0]).join('')}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-neutral-800">{s.full_name}</div>
                                        <div className="text-xs text-neutral-400">
                                            {s.enrollment_status === 'new' ? 'New' : 'Established'} · {s.archived ? 'Archived' : 'Active'}
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Previous Month Banner (§3.6) */}
            {isShowingPrevious && (
                <div className="max-w-2xl mx-auto mb-8 bg-primary-50 border border-primary-200 rounded-2xl px-6 py-4 text-center">
                    <p className="text-primary-800 font-semibold">🏆 Previous Month's Final Rankings</p>
                    <p className="text-primary-600 text-sm mt-1">Live rankings will appear once enough current-month assessments exist.</p>
                </div>
            )}

            {/* Empty State */}
            {!isSearching && activeBoard.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-neutral-100">
                    <span className="text-4xl mb-4 block">📊</span>
                    <h3 className="text-neutral-700 font-bold text-xl">No rankings available yet</h3>
                    <p className="text-neutral-500 mt-2">Assessments haven't begun for this period.</p>
                </div>
            )}

            {/* Podium (Top 3) */}
            {!isSearching && top3.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-6 lg:gap-8 mb-16 animate-slide-up w-full">
                    {podiumOrder.map((entry) => (
                        <PodiumCard key={entry.student_id} entry={entry} />
                    ))}
                </div>
            )}

            {/* Rankings List */}
            {!isSearching && listEntries.length > 0 && (
                <div className="bg-white rounded-3xl shadow-elevated border border-neutral-100 overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <div className="bg-gradient-to-r from-primary-800 to-primary-600 px-6 py-4 flex justify-between items-center">
                        <h2 className="text-white font-bold text-lg">📋 {showAll ? 'Full Rankings' : 'Ranking List'}</h2>
                        <span className="text-primary-100 text-sm font-medium bg-primary-900/30 px-3 py-1 rounded-full">
                            {showAll ? `${activeBoard.length} total` : `Top ${topN}`}
                        </span>
                    </div>
                    <div className="divide-y divide-neutral-100">
                        {listEntries.map((entry) => (
                            <ListRow key={entry.student_id} entry={entry} />
                        ))}
                    </div>

                    {/* "See more" (§5.1) */}
                    {hasMore && (
                        <button
                            onClick={() => setShowAll(true)}
                            className="w-full py-4 text-primary-600 hover:bg-primary-50 font-semibold transition-colors border-t border-neutral-100"
                        >
                            See more — view full board ({activeBoard.length} students)
                        </button>
                    )}
                    {showAll && activeBoard.length > topN && (
                        <button
                            onClick={() => setShowAll(false)}
                            className="w-full py-4 text-neutral-500 hover:bg-neutral-50 font-medium transition-colors border-t border-neutral-100"
                        >
                            Collapse to Top {topN}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ---- Subcomponents ----

function PodiumCard({ entry }: { entry: BoardEntry }) {
    const isFirst = entry.rank === 1;
    const isSecond = entry.rank === 2;
    const isThird = entry.rank === 3;

    let containerClasses = "relative bg-white rounded-3xl border flex flex-col items-center justify-between p-6 w-full max-w-sm sm:w-64 transition-transform hover:-translate-y-1 ";
    let medal = '';

    if (isFirst) {
        containerClasses += "border-yellow-300 shadow-[0_0_40px_-5px_rgba(250,204,21,0.4)] sm:h-80 z-10 sm:-mt-8 order-1 sm:order-2";
        medal = '🥇';
    } else if (isSecond) {
        containerClasses += "border-slate-300 shadow-card sm:h-72 order-2 sm:order-1";
        medal = '🥈';
    } else if (isThird) {
        containerClasses += "border-amber-600/30 shadow-card sm:h-64 order-3 sm:order-3";
        medal = '🥉';
    }

    return (
        <Link to={`/student/${entry.student_id}`} className={containerClasses}>
            <div className={`absolute -top-5 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm border-2 border-white
                ${isFirst ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-white' :
                    isSecond ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-white' :
                        'bg-gradient-to-br from-amber-500 to-amber-700 text-white'}`}>
                #{entry.rank}
            </div>
            <div className="text-center mt-4">
                <div className="text-4xl mb-3 filter drop-shadow-sm">{medal}</div>
                <h3 className="text-xl font-bold text-neutral-800 break-words line-clamp-2">{entry.masked_name}</h3>
            </div>
            <div className="w-full mt-6 bg-neutral-50 rounded-2xl p-4 text-center border border-neutral-100">
                <div className="text-primary-700 font-black text-3xl tracking-tight">{entry.rating.toFixed(2)}</div>
                <div className="text-xs text-neutral-400 mt-1 uppercase tracking-wider font-semibold">Rating</div>
            </div>
            <div className="mt-4 text-xs text-neutral-400 flex items-center gap-1 font-medium bg-white px-3 py-1 rounded-full shadow-sm border border-neutral-100">
                📋 {entry.assessment_count} Assessments
            </div>
        </Link>
    );
}

function ListRow({ entry }: { entry: BoardEntry }) {
    return (
        <Link to={`/student/${entry.student_id}`} className="px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors group block">
            <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-500 font-bold flex items-center justify-center shadow-sm border border-neutral-200 group-hover:bg-primary-50 group-hover:text-primary-600 group-hover:border-primary-200 transition-colors">
                    {entry.rank}
                </div>
                <div>
                    <h4 className="text-neutral-800 font-semibold text-lg">{entry.masked_name}</h4>
                    <p className="text-neutral-400 text-sm flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-500"></span>
                        {entry.assessment_count} assessments
                    </p>
                </div>
            </div>
            <div className="text-right">
                <div className="inline-block bg-primary-50 text-primary-800 px-4 py-1.5 rounded-xl font-bold text-lg border border-primary-100 shadow-sm">
                    {entry.rating.toFixed(2)}
                </div>
            </div>
        </Link>
    );
}
