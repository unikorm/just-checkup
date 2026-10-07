// @ts-check
/**
 * Import this FIRST in every test file. It pins the time zone to one with
 * daylight saving (last Sunday of March / October) so zone-aware code is
 * tested against DST transitions regardless of the machine running the tests.
 */
process.env.TZ = 'Europe/Bratislava';
