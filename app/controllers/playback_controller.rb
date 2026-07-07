class PlaybackController < ApplicationController
  def show
    @videos = Video.order(:id)
  end
end
