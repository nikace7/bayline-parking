from django.urls import path

from modules.billing import views

urlpatterns = [
    path("parking/sessions", views.SessionListView.as_view()),
    path("parking/sessions/<uuid:session_id>", views.SessionDetailView.as_view()),
    path("parking/sessions/<uuid:session_id>/quote", views.QuoteView.as_view()),
    path("parking/sessions/<uuid:session_id>/checkout", views.CheckoutView.as_view()),
    path("parking/sessions/<uuid:session_id>/exit", views.ExitView.as_view()),
    path("invoices/<uuid:invoice_id>/payments", views.CashPaymentView.as_view()),
    path("shifts", views.ShiftListView.as_view()),
    path("shifts/open", views.ShiftOpenView.as_view()),
    path("shifts/current", views.CurrentShiftView.as_view()),
    path("shifts/<uuid:shift_id>/summary", views.ShiftSummaryView.as_view()),
    path("shifts/<uuid:shift_id>/close", views.ShiftCloseView.as_view()),
    path("memberships", views.MembershipListView.as_view()),
    path("memberships/<uuid:pass_id>/renew", views.MembershipRenewView.as_view()),
    path("receipts/<uuid:receipt_id>", views.ReceiptView.as_view()),
    path("receipts/<uuid:receipt_id>/print-events", views.PrintEventView.as_view()),
]
