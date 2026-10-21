export const AddingLinkState = {
    NORMAL: 'NORMAL',
    SELECTING_SOURCE: 'SELECTING_SOURCE',
    SELECTING_DESTINATION: 'SELECTING_DESTINATION'
};

export function linkHint(state) {
    if (state === AddingLinkState.SELECTING_SOURCE) return "Kliknij urządzenie źródłowe";
    if (state === AddingLinkState.SELECTING_DESTINATION) return "Kliknij urządzenie docelowe";
    return null;
}
