from django.urls import path

from modules.parking import views

urlpatterns = [
    path("parking/entries", views.EntryView.as_view()),
    path("public/locations", views.PublicLocationListView.as_view()),
    path(
        "public/locations/<uuid:location_id>/availability",
        views.AvailabilityView.as_view(),
    ),
    path("customer/reservations", views.CustomerReservationListView.as_view()),
    path(
        "customer/reservations/<uuid:reservation_id>",
        views.CustomerReservationDetailView.as_view(),
    ),
    path("reservations", views.StaffReservationListView.as_view()),
    path("reservations/<uuid:reservation_id>/confirm", views.ConfirmView.as_view()),
    path("reservations/<uuid:reservation_id>/cancel", views.CancelView.as_view()),
    path("reservations/<uuid:reservation_id>/relocate", views.RelocateView.as_view()),
]
