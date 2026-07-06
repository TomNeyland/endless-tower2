/**
 * The combo-stream bus — same discipline as the movement EventBus: handlers
 * run synchronously in subscription order, and the engine emits without ever
 * knowing who listens. Carries the combined combo/* + score/* stream.
 */
import type { AnyComboEvent, AnyComboEventType, ComboEventOf } from './types';

type AnyComboHandler = (event: AnyComboEvent) => void;

export class ComboBus {
    private handlers = new Map<AnyComboEventType, AnyComboHandler[]>();
    private anyHandlers: AnyComboHandler[] = [];

    on<T extends AnyComboEventType>(type: T, fn: (event: ComboEventOf<T>) => void): void {
        const list = this.handlers.get(type) ?? [];
        list.push(fn as AnyComboHandler);
        this.handlers.set(type, list);
    }

    off<T extends AnyComboEventType>(type: T, fn: (event: ComboEventOf<T>) => void): void {
        const list = this.handlers.get(type);
        if (list) {
            this.handlers.set(
                type,
                list.filter((h) => h !== (fn as AnyComboHandler)),
            );
        }
    }

    onAny(fn: AnyComboHandler): void {
        this.anyHandlers.push(fn);
    }

    offAny(fn: AnyComboHandler): void {
        this.anyHandlers = this.anyHandlers.filter((h) => h !== fn);
    }

    emit(event: AnyComboEvent): void {
        const list = this.handlers.get(event.type);
        if (list) {
            for (const fn of list) {
                fn(event);
            }
        }
        for (const fn of this.anyHandlers) {
            fn(event);
        }
    }

    clear(): void {
        this.handlers.clear();
        this.anyHandlers = [];
    }
}
