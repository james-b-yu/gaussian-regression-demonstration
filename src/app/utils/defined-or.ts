/**
 * in javascript, "" is a falsy value
 * sometimes, this is not the behaviour we want
 * this function checks if value is null or undefined. if it is, it returns defaultValue. otherwise, it returns value
 * this is akin to the expression (value || defaultValue), but only null and undefined are considered falsy.
 */

export const definedOr = <T>(value: T | null | undefined, defaultValue: T): T => {
    return (value === null || value === undefined) ? defaultValue : value;
}