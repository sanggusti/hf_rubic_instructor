import type { LessonStep } from './lesson_types';

export type CoachingMessageKind = 'hint' | 'mistake' | 'recommendation';

export interface CoachingMessage {
    kind: CoachingMessageKind;
    title: string;
    body: string;
}

export interface CoachingContext {
    step: LessonStep;
    moveHistory: string[];
    stepCompleted: boolean;
    lessonCompleted: boolean;
    isLastStep: boolean;
    nextLessonTitle?: string;
}

function hint(body: string): CoachingMessage {
    return { kind: 'hint', title: 'Hint', body };
}

function mistake(body: string): CoachingMessage {
    return { kind: 'mistake', title: 'Watch out', body };
}

function recommendation(body: string): CoachingMessage {
    return { kind: 'recommendation', title: 'Next', body };
}

// Pure, deterministic coaching for the current lesson step. It never blocks
// progress; the engine still validates completion via endsWithMoves.
export function buildCoachingMessages(args: CoachingContext): CoachingMessage[] {
    const { step, moveHistory, stepCompleted, lessonCompleted, isLastStep, nextLessonTitle } = args;

    if (lessonCompleted) {
        const messages: CoachingMessage[] = [recommendation('Lesson complete.')];
        if (nextLessonTitle) messages.push(recommendation(`Try next: ${nextLessonTitle}`));
        return messages;
    }

    switch (step.validator.type) {
        case 'moveSequence':
            return sequenceMessages(step, step.validator.moves, moveHistory, stepCompleted, isLastStep);

        case 'manual':
            return step.hints?.length
                ? [hint(step.hints[0])]
                : [recommendation('Read the step, then press Mark complete when ready.')];

        case 'cubeSolved':
            if (stepCompleted) return [recommendation('Cube is solved. Continue.')];
            return step.hints?.length
                ? [hint(step.hints[0])]
                : [
                    recommendation(
                        'Solve the cube from this setup. If you get lost, reset the cube and set up the step again.'
                    )
                ];
    }
}

function sequenceMessages(
    step: LessonStep,
    expectedMoves: string[],
    moveHistory: string[],
    stepCompleted: boolean,
    isLastStep: boolean
): CoachingMessage[] {
    if (stepCompleted) {
        return [
            recommendation(isLastStep ? 'Step complete. Finish the lesson.' : 'Continue to the next step.')
        ];
    }

    if (moveHistory.length === 0) {
        return [step.hints?.length ? hint(step.hints[0]) : hint(`Start with ${expectedMoves[0]}.`)];
    }

    // Longest correct prefix of the attempt against the expected sequence.
    let matched = 0;
    while (
        matched < moveHistory.length &&
        matched < expectedMoves.length &&
        moveHistory[matched] === expectedMoves[matched]
    ) {
        matched++;
    }

    if (matched === moveHistory.length) {
        // Still on track; suggest the next move if any remain.
        if (matched < expectedMoves.length) return [hint(`Next move: ${expectedMoves[matched]}.`)];
        return [];
    }

    // A move broke the expected sequence.
    const expectedMove = expectedMoves[matched] ?? expectedMoves[expectedMoves.length - 1];
    return [
        mistake(`Expected ${expectedMove}, but got ${moveHistory[matched]}.`),
        recommendation('Try the sequence again from the beginning, or use Apply example moves.')
    ];
}
