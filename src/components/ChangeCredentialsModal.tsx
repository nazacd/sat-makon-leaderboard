import { useState } from 'react';
import Modal from '@/components/Modal';
import { useData } from '@/services/DataProvider';
import { logAction } from '@/services/auditLog';
import type { Teacher } from '@shared/types';

interface Props {
    teacher: Teacher;
    onClose: () => void;
}

export default function ChangeCredentialsModal({ teacher, onClose }: Props) {
    const data = useData();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSave = () => {
        setError(null);

        const verified = data.authenticateStaff(teacher.username, currentPassword);
        if (!verified) {
            setError('Current password is incorrect.');
            return;
        }

        const trimmedUsername = newUsername.trim();
        const updates: Partial<Teacher> = {};

        if (trimmedUsername) {
            if (/\s/.test(trimmedUsername)) {
                setError('Username must not contain spaces.');
                return;
            }
            if (!data.isUsernameAvailable(trimmedUsername, teacher.id)) {
                setError(`Username "${trimmedUsername}" is already taken.`);
                return;
            }
            updates.username = trimmedUsername;
        }

        if (newPassword) {
            if (newPassword.length < 6) {
                setError('New password must be at least 6 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            updates.password = newPassword;
        }

        if (!updates.username && !updates.password) {
            setError('No changes provided. Enter a new username or password.');
            return;
        }

        try {
            data.updateTeacher(teacher.id, updates, teacher);
            const changed = [updates.username ? 'username' : null, updates.password ? 'password' : null]
                .filter(Boolean).join(', ');
            logAction(teacher.full_name, 'self_update_credentials', teacher.id, undefined, changed);
            setSuccess(true);
        } catch (e: any) {
            setError(e.message);
        }
    };

    if (success) {
        return (
            <Modal title="Credentials Updated" onClose={onClose}>
                <div className="text-center py-4 space-y-3">
                    <div className="text-4xl">✅</div>
                    <p className="text-neutral-700 font-semibold">Your credentials have been updated.</p>
                    <p className="text-sm text-neutral-500">Changes take effect on next login.</p>
                    <button onClick={onClose}
                        className="mt-2 px-6 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors">
                        Done
                    </button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            title="Change Credentials"
            onClose={onClose}
            maxWidth="max-w-md"
            footer={
                <>
                    <button onClick={onClose}
                        className="px-5 py-2 bg-white border border-neutral-200 text-neutral-600 font-bold rounded-xl hover:bg-neutral-50">
                        Cancel
                    </button>
                    <button onClick={handleSave}
                        className="px-5 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700">
                        Save Changes
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                {error && (
                    <div className="bg-error-50 border border-error-200 text-error-700 font-medium px-4 py-3 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Current Username</label>
                    <div className="px-4 py-2 rounded-xl border border-neutral-100 bg-neutral-50 font-mono text-neutral-600 text-sm">
                        {teacher.username}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">
                        Current Password <span className="text-error-500">*</span>
                    </label>
                    <input type="password" placeholder="Required to make any change"
                        value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>

                <hr className="border-neutral-100" />

                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">
                        New Username <span className="text-neutral-400 font-normal text-xs">(leave blank to keep)</span>
                    </label>
                    <input type="text" placeholder="Leave blank to keep current"
                        value={newUsername} onChange={e => setNewUsername(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono" />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-1.5">
                        New Password <span className="text-neutral-400 font-normal text-xs">(leave blank to keep)</span>
                    </label>
                    <input type="password" placeholder="Min 6 characters"
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>

                {newPassword && (
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Confirm New Password</label>
                        <input type="password" placeholder="Repeat new password"
                            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                )}
            </div>
        </Modal>
    );
}
