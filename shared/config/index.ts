// ===== SAT-MAKON Config Knobs (§9) =====
// Single source for all tunable rule-numbers.
// Values are loaded from the mock data's config block via the data layer.
// Never hardcode these inline in components or engine logic.

import type { Config } from '../types';

/** Default config values matching §9 of the spec */
export const DEFAULT_CONFIG: Config = {
    alpha: 0.4,
    mid_month_cutoff_day: 15,
    stream_min_assessments: 2,
    main_board_min_streams: 2,
    teacher_self_edit_window_days: 7,
    top_n_main_page: 30,
    timezone: 'Asia/Tashkent',
    mask_format: 'first_name_last_initial',
};

let _config: Config = { ...DEFAULT_CONFIG };

/** Initialize config from data layer (called once at app boot) */
export function initConfig(config: Config): void {
    _config = { ...config };
}

/** Get the current config. Always use this — never import DEFAULT_CONFIG for runtime values. */
export function getConfig(): Readonly<Config> {
    return _config;
}
