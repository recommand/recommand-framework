import type { Env, ValidationTargets } from 'hono';
import type { z } from 'zod';
import { validator as baseZValidator, resolver as baseZResolver } from "hono-openapi/zod";

type InputDetail = {
    path: string;
    message: string;
};

type InvalidInputDetail = InputDetail & {
    unionErrors?: InputDetail[][];
};

export function zodValidator<
    T extends z.ZodType,
    Target extends keyof ValidationTargets,
    E extends Env,
    P extends string,
>(
    target: Target,
    schema: T,
) {
    return baseZValidator<T, Target, E, P>(target, schema, (result, c) => {
        if (!result.success) {
            const {invalidInputDetails, listedErrors} = cleanZodError(result.error as z.ZodError);
            return c.json({
                success: false as const,
                errors: {
                    ...listedErrors,
                },
                invalidInputDetails,
            }, 400);
        }
    });
}

export function zodResolver(schema: z.ZodType) {
    return baseZResolver(schema);
}

/**
 * True for an issue that says "this variant is not the one the input asked
 * for", rather than "this variant is the right one but the input is wrong".
 * A union of object variants distinguished by a constant field reports the
 * former on every variant the input did not select.
 */
const isDiscriminatorMismatch = (issue: z.ZodIssue): boolean =>
    issue.code === 'invalid_literal' ||
    issue.code === 'invalid_enum_value' ||
    issue.code === 'invalid_union_discriminator';

/** The constant values a discriminator issue says it would have accepted. */
const discriminatorOptions = (issue: z.ZodIssue): unknown[] => {
    if (issue.code === 'invalid_literal') return [issue.expected];
    if (issue.code === 'invalid_enum_value') return issue.options;
    if (issue.code === 'invalid_union_discriminator') return issue.options;
    return [];
};

const formatOptions = (options: unknown[]): string =>
    options.map((option) => JSON.stringify(option)).join(', ');

const cleanZodError = (error: z.ZodError): {invalidInputDetails: InvalidInputDetail[], listedErrors: {[key: string]: string[]}} => {
    // Output the error in a more readable format with path and message for each error
    const errorsArray: InvalidInputDetail[] = [];
    const listedErrors: {[key: string]: string[]} = {};
    // Every listed error keeps its own path in the string, because callers join
    // the values of this map into a single sentence and would otherwise lose
    // track of which field each message belongs to.
    const listError = (path: (string | number)[], message: string) => {
        const key = path.join('.');
        const messages = listedErrors[key] ?? (listedErrors[key] = []);
        messages.push(key + ": " + message);
    };
    for (const issue of error.issues) {
        if (issue.code === 'invalid_union') {
            const unionErrors = issue.unionErrors.map((unionError) =>
                unionError.issues.map((unionErrorIssue) => ({
                    path: unionErrorIssue.path.join('.'),
                    message: unionErrorIssue.message,
                })),
            );
            // Variants that accepted the discriminator, so the input was meant
            // for them and their errors are the ones worth reporting.
            const selected = issue.unionErrors.filter(
                (unionError) => !unionError.issues.some(isDiscriminatorMismatch),
            );
            if (selected.length === 1) {
                for (const unionErrorIssue of selected[0]!.issues) {
                    listError([...issue.path, ...unionErrorIssue.path], unionErrorIssue.message);
                }
                errorsArray.push({
                    path: issue.path.join('.'),
                    message: "Invalid union, the errors of the variant matching your input are listed under their own paths.",
                    unionErrors,
                });
                continue;
            }
            // No variant accepted the discriminator: the input names a type
            // that does not exist, so say which ones do.
            const accepted: {[key: string]: unknown[]} = {};
            for (const unionError of issue.unionErrors) {
                for (const unionErrorIssue of unionError.issues) {
                    if (!isDiscriminatorMismatch(unionErrorIssue)) continue;
                    const key = [...issue.path, ...unionErrorIssue.path].join('.');
                    const options = accepted[key] ?? (accepted[key] = []);
                    for (const option of discriminatorOptions(unionErrorIssue)) {
                        if (!options.includes(option)) options.push(option);
                    }
                }
            }
            if (selected.length === 0 && Object.keys(accepted).length > 0) {
                for (const [key, options] of Object.entries(accepted)) {
                    listError(key === '' ? [] : key.split('.'), `Invalid discriminator value, accepted values are: ${formatOptions(options)}.`);
                }
                errorsArray.push({
                    path: issue.path.join('.'),
                    message: "Invalid union, no variant accepts the type named in your input.",
                    unionErrors,
                });
                continue;
            }
            errorsArray.push({
                path: issue.path.join('.'),
                message: "Invalid union, fix at least one of the following errors depending on the input type you are targeting.",
                unionErrors,
            });
            listedErrors[issue.path.join('.')] = [`Invalid union, make sure your input is consistent with one of the possible types for ${issue.path.join('.')}.`];
        }else if (issue.code === 'invalid_union_discriminator') {
            const message = `Invalid discriminator value, accepted values are: ${formatOptions(issue.options)}.`;
            errorsArray.push({
                path: issue.path.join('.'),
                message,
            });
            listError(issue.path, message);
        }else{
            errorsArray.push({
                path: issue.path.join('.'),
                message: issue.message,
            });
            listError(issue.path, issue.message);
        }
    }
    return {invalidInputDetails: errorsArray, listedErrors: listedErrors};
};
